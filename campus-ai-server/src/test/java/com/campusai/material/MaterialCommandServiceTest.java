package com.campusai.material;

import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;
import org.springframework.transaction.*;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import javax.sql.DataSource;
import tools.jackson.databind.json.JsonMapper;
import java.util.*;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.*;

@SpringJUnitConfig(MaterialCommandServiceTest.Config.class) @Timeout(15)
class MaterialCommandServiceTest {
    @Configuration @EnableTransactionManagement static class Config {
        @Bean DataSource data(){return new DriverManagerDataSource("jdbc:h2:mem:material_receipts;MODE=MySQL;DB_CLOSE_DELAY=-1;LOCK_TIMEOUT=3000","sa","");}
        @Bean JdbcTemplate jdbc(DataSource data){return new JdbcTemplate(data);}
        @Bean PlatformTransactionManager tx(DataSource data){return new DataSourceTransactionManager(data);}
        @Bean MaterialCommandService service(JdbcTemplate jdbc){return new MaterialCommandService(jdbc,JsonMapper.builder().build());}
    }
    @Autowired JdbcTemplate jdbc; @Autowired MaterialCommandService service;
    @BeforeEach void setup(){
        jdbc.execute("DROP ALL OBJECTS");
        jdbc.execute("CREATE TABLE users(id BIGINT PRIMARY KEY,school_id BIGINT,role VARCHAR(20),status INT)");
        jdbc.update("INSERT INTO users VALUES(1,1,'STUDENT',1),(2,1,'ADMIN',1),(3,2,'ADMIN',1)");
        jdbc.execute("CREATE TABLE material_command_receipts(owner_id BIGINT,school_id BIGINT,request_id CHAR(36),kind VARCHAR(40),payload_sha256 CHAR(64),result_json CLOB,PRIMARY KEY(owner_id,request_id))");
        jdbc.execute("CREATE TABLE effects(id BIGINT AUTO_INCREMENT PRIMARY KEY,body VARCHAR(100))");
    }
    private MaterialCommandService.Receipt write(long owner,String id,String body,String kind){
        return service.execute(owner,id,kind,Map.of("body",body),()->{
            jdbc.update("INSERT INTO effects(body) VALUES(?)",body);
            return Map.of("id",jdbc.queryForObject("SELECT MAX(id) FROM effects",Long.class),"body",body,"status","PENDING");
        });
    }
    @Test void replayAndRefreshReturnOriginalReceiptWithoutRepeatedEffect(){
        String id=UUID.randomUUID().toString(); var first=write(1,id,"合成资料","KNOWLEDGE_SUBMISSION");
        assertThat(write(1,id,"合成资料","KNOWLEDGE_SUBMISSION")).isEqualTo(first);
        assertThat(service.read(1L,id)).isEqualTo(first);
        assertThatThrownBy(()->write(1,id,"改过","KNOWLEDGE_SUBMISSION")).hasMessageContaining("409");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM effects",Integer.class)).isEqualTo(1);
    }
    @Test void currentOwnerSchoolAndAdminAreCheckedBeforeReceiptOrWrite(){
        String id=UUID.randomUUID().toString();write(2,id,"合成商家","MERCHANT_DRAFT");
        assertThatThrownBy(()->service.read(3L,id)).hasMessageContaining("404");
        assertThatThrownBy(()->write(1,UUID.randomUUID().toString(),"shop","MERCHANT_DRAFT")).hasMessageContaining("403");
        jdbc.update("UPDATE users SET role='STUDENT' WHERE id=2");
        assertThatThrownBy(()->service.read(2L,id)).hasMessageContaining("403");
        jdbc.update("UPDATE users SET school_id=2 WHERE id=2");
        assertThatThrownBy(()->service.read(2L,id)).hasMessageContaining("404");
        assertThatThrownBy(()->service.read(null,id)).hasMessageContaining("401");
    }
    @Test void receiptFailureRollsBackActualBusinessWrite(){
        jdbc.execute("ALTER TABLE material_command_receipts ADD CONSTRAINT fail_receipt CHECK (kind <> 'KNOWLEDGE_SUBMISSION')");
        assertThatThrownBy(()->write(1,UUID.randomUUID().toString(),"rollback","KNOWLEDGE_SUBMISSION")).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM effects",Integer.class)).isZero();
    }
    @Test void oldSchemaIsExplicitlyUnavailableAndDoesNotWrite(){
        jdbc.execute("DROP TABLE material_command_receipts");
        assertThat(service.available()).isFalse();
        assertThatThrownBy(()->write(1,UUID.randomUUID().toString(),"no","KNOWLEDGE_SUBMISSION")).hasMessageContaining("503");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM effects",Integer.class)).isZero();
    }
    @Test void malformedIdsAndDisabledUsersCannotReadOrWrite(){
        assertThatThrownBy(()->service.read(1L,"abc")).hasMessageContaining("400");
        jdbc.update("UPDATE users SET status=0 WHERE id=1");
        assertThatThrownBy(()->write(1,UUID.randomUUID().toString(),"no","KNOWLEDGE_SUBMISSION")).hasMessageContaining("403");
    }
    @Test void realConcurrentTransactionsCommitOneEffect() throws Exception {
        var pool=Executors.newFixedThreadPool(2);String id=UUID.randomUUID().toString();var ready=new CountDownLatch(2);var go=new CountDownLatch(1);
        try {
            Callable<MaterialCommandService.Receipt> call=()->{ready.countDown();if(!go.await(3,TimeUnit.SECONDS))throw new IllegalStateException();return write(1,id,"concurrent","KNOWLEDGE_SUBMISSION");};
            var a=pool.submit(call);var b=pool.submit(call);assertThat(ready.await(3,TimeUnit.SECONDS)).isTrue();go.countDown();
            assertThat(a.get(5,TimeUnit.SECONDS)).isEqualTo(b.get(5,TimeUnit.SECONDS));
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM effects",Integer.class)).isEqualTo(1);
        } finally {go.countDown();pool.shutdownNow();}
    }
}
