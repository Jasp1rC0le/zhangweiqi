package com.campusai.service;

import com.campusai.dto.CreateContactMessageRequest;
import com.campusai.mapper.ContactMessageMapper;
import com.campusai.mapper.UserMapper;
import com.campusai.service.impl.ContactMessageServiceImpl;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.mybatis.spring.SqlSessionFactoryBean;
import org.mybatis.spring.SqlSessionTemplate;
import javax.sql.DataSource;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

@SpringJUnitConfig(ContactSubmissionRetryTest.Config.class)
@Timeout(15)
class ContactSubmissionRetryTest {
    @Configuration @EnableTransactionManagement static class Config {
        @Bean DataSource dataSource(){return new DriverManagerDataSource("jdbc:h2:mem:contactretry;MODE=MySQL;DB_CLOSE_DELAY=-1;LOCK_TIMEOUT=3000","sa","");}
        @Bean JdbcTemplate jdbc(DataSource source){return new JdbcTemplate(source);}
        @Bean PlatformTransactionManager transactions(DataSource source){return new DataSourceTransactionManager(source);}
        @Bean ContactMessageMapper mapper(DataSource source) throws Exception {
            var factory=new SqlSessionFactoryBean();factory.setDataSource(source);
            var configuration=new org.apache.ibatis.session.Configuration();configuration.setMapUnderscoreToCamelCase(true);
            factory.setConfiguration(configuration);factory.setMapperLocations(new ClassPathResource("mapper/ContactMessageMapper.xml"));
            return new SqlSessionTemplate(factory.getObject()).getMapper(ContactMessageMapper.class);
        }
        @Bean UserMapper users(){
            var users=mock(UserMapper.class);
            for(long id: new long[]{1,2}){
                var user=new com.campusai.user.entity.User();user.setId(id);user.setSchoolId(1L);user.setStatus(1);user.setRole("STUDENT");
                when(users.findById(id)).thenReturn(user);
            }
            return users;
        }
        @Bean ContactMessageService service(ContactMessageMapper mapper,UserMapper users){return new ContactMessageServiceImpl(mapper,users,1L);}
    }
    @Autowired JdbcTemplate jdbc;
    @Autowired ContactMessageService service;
    @BeforeEach void setup() throws Exception {
        jdbc.execute("DROP ALL OBJECTS");
        jdbc.execute("CREATE TABLE users(id BIGINT PRIMARY KEY)");jdbc.update("INSERT INTO users VALUES(1),(2)");
        jdbc.execute("CREATE TABLE schools(id BIGINT PRIMARY KEY)");jdbc.update("INSERT INTO schools VALUES(1)");
        String schema=new ClassPathResource("schema.sql").getContentAsString(StandardCharsets.UTF_8);
        for(String sql:schema.substring(schema.indexOf("CREATE TABLE IF NOT EXISTS contact_messages"),schema.indexOf("CREATE TABLE IF NOT EXISTS student_projects")).replaceAll("(?m)^\\s*--[^\\r\\n]*", "").split(";"))if(!sql.isBlank())jdbc.execute(sql);
    }
    private CreateContactMessageRequest request(String id,String body){
        var r=new CreateContactMessageRequest();r.setRequestId(id);r.setName(" 同学 ");r.setContact("test@example.invalid");r.setSubject("建议");r.setMessage(body);return r;
    }
    @Test void sameRequestReturnsReceiptButChangedBodyDoesNotInsertAgain(){
        String key=UUID.randomUUID().toString();var first=service.submit(request(key,"正文"),1L);
        assertThat(service.submit(request(key,"正文"),1L).getId()).isEqualTo(first.getId());
        assertThatThrownBy(()->service.submit(request(key,"改动"),1L)).hasMessageContaining("409");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM contact_messages",Integer.class)).isEqualTo(1);
    }
    @Test void requestIdsAreAccountBoundAndKeysCascadeWithMessage(){
        String key=UUID.randomUUID().toString();var first=service.submit(request(key,"正文"),1L);
        var second=service.submit(request(key,"正文"),2L);assertThat(second.getId()).isNotEqualTo(first.getId());
        jdbc.update("DELETE FROM contact_messages WHERE id=?",first.getId());
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM contact_submission_keys",Integer.class)).isEqualTo(1);
        assertThat(service.submit(request(key,"正文"),2L).getId()).isEqualTo(second.getId());
    }
    @Test void guestAndMalformedRequestIdsDoNotInsert(){
        assertThatThrownBy(()->service.submit(request(UUID.randomUUID().toString(),"正文"),null)).hasMessageContaining("400");
        assertThatThrownBy(()->service.submit(request("not-an-id","正文"),1L)).hasMessageContaining("400");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM contact_messages",Integer.class)).isZero();
    }
    @Test void receiptFailureRollsBackMessageInsteadOfLeavingAnUntrackedSubmission(){
        String key=UUID.randomUUID().toString();
        jdbc.execute("ALTER TABLE contact_submission_keys ADD CONSTRAINT test_receipt_failure CHECK (request_id <> '"+key+"')");
        assertThatThrownBy(()->service.submit(request(key,"正文"),1L)).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM contact_messages",Integer.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM contact_submission_keys",Integer.class)).isZero();
    }
    @Test void concurrentRetriesCreateOneMessage() throws Exception {
        String key=UUID.randomUUID().toString();var executor=Executors.newFixedThreadPool(2);
        var ready=new CountDownLatch(2);var go=new CountDownLatch(1);
        try {
            Callable<Long> call=()->{ready.countDown();if(!go.await(3,TimeUnit.SECONDS))throw new IllegalStateException("test timeout");return service.submit(request(key,"正文"),1L).getId();};
            var a=executor.submit(call);var b=executor.submit(call);assertThat(ready.await(3,TimeUnit.SECONDS)).isTrue();go.countDown();
            assertThat(a.get(5,TimeUnit.SECONDS)).isEqualTo(b.get(5,TimeUnit.SECONDS));
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM contact_messages",Integer.class)).isEqualTo(1);
        } finally {go.countDown();executor.shutdownNow();}
    }
}
