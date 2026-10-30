package com.campusai.wall;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
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
import javax.sql.DataSource;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import static org.assertj.core.api.Assertions.*;

@SpringJUnitConfig(WallServiceTest.Config.class)
class WallServiceTest {
    @Configuration @EnableTransactionManagement static class Config {
        @Bean DataSource dataSource(){return new DriverManagerDataSource("jdbc:h2:mem:walltests;MODE=MySQL;DB_CLOSE_DELAY=-1","sa","");}
        @Bean JdbcTemplate jdbc(DataSource d){return new JdbcTemplate(d);}
        @Bean PlatformTransactionManager tx(DataSource d){return new DataSourceTransactionManager(d);}
        @Bean WallService wall(JdbcTemplate j){return new WallService(j);}
    }
    @Autowired JdbcTemplate jdbc;
    @Autowired WallService wall;
    String id;
    @BeforeEach void setup() throws Exception {
        jdbc.execute("DROP ALL OBJECTS");jdbc.execute("CREATE TABLE schools(id BIGINT PRIMARY KEY)");jdbc.execute("CREATE TABLE users(id BIGINT PRIMARY KEY)");
        jdbc.update("INSERT INTO schools VALUES(1),(2)");jdbc.update("INSERT INTO users VALUES(1),(2),(3)");
        String schema=new ClassPathResource("schema.sql").getContentAsString(StandardCharsets.UTF_8);
        for(String sql:schema.substring(schema.indexOf("CREATE TABLE IF NOT EXISTS campus_wall_entries")).split(";\\s*(?=CREATE|$)"))if(!sql.isBlank())jdbc.execute(sql);
        id=UUID.randomUUID().toString();wall.create(1L,1L,new WallService.Input(id,"experiment","波形不稳定","已经记录了触发设置，想请教怎么理解这个现象"));
    }
    void publish(){wall.review(1L,3L,id,new WallService.ReviewInput(1,"PUBLISHED",""));}
    @Test void safePostsAreImmediateButSchoolIsolationRemains(){
        assertThat(wall.list(1L,2L,"",false,0).items()).hasSize(1);
        assertThat(wall.list(1L,1L,"",true,0).items()).hasSize(1);
        assertThat(wall.get(1L,2L,id).status()).isEqualTo("PUBLISHED");
        assertThatThrownBy(()->wall.get(2L,1L,id)).hasMessageContaining("404");
        assertThat(wall.moderationContext(1L,3L,id).status()).isEqualTo("PUBLISHED");
        assertThatThrownBy(()->wall.moderationContext(2L,3L,id)).hasMessageContaining("404");
        publish();assertThat(wall.list(1L,2L,"experiment",false,0).items()).hasSize(1);
        assertThat(wall.list(2L,2L,"",false,0).items()).isEmpty();
        assertThatThrownBy(()->wall.review(2L,3L,id,new WallService.ReviewInput(2,"HIDDEN",""))).hasMessageContaining("404");
    }
    @Test void retryDoesNotDuplicateAndCannotOverwrite(){
        wall.create(1L,1L,new WallService.Input(id,"experiment","波形不稳定","已经记录了触发设置，想请教怎么理解这个现象"));
        assertThat(wall.list(1L,1L,"",true,0).items()).hasSize(1);
        assertThatThrownBy(()->wall.create(1L,2L,new WallService.Input(id,"course","盗用请求编号","不同内容"))).hasMessageContaining("409");
        assertThatThrownBy(()->wall.create(1L,1L,new WallService.Input(id,"course","不同内容","不同内容"))).hasMessageContaining("409");
    }
    @Test void repliesPublishImmediatelyAndParentHidingRevokesVisibility(){
        String c=UUID.randomUUID().toString();
        assertThatThrownBy(()->wall.comment(2L,2L,id,new WallService.CommentInput(c,"先对照教师实验说明"))).hasMessageContaining("404");
        publish();wall.comment(1L,2L,id,new WallService.CommentInput(c,"先对照教师实验说明"));
        wall.comment(1L,2L,id,new WallService.CommentInput(c,"先对照教师实验说明"));
        assertThat(wall.comments(1L,1L,id,0).items()).hasSize(1);assertThat(wall.comments(1L,2L,id,0).items()).hasSize(1);
        wall.review(1L,3L,c,new WallService.ReviewInput(1,"PUBLISHED",""));assertThat(wall.get(1L,1L,id).replies()).isEqualTo(1);
        wall.review(1L,3L,id,new WallService.ReviewInput(2,"HIDDEN","待复核"));
        assertThatThrownBy(()->wall.get(1L,2L,c)).hasMessageContaining("404");
        assertThatThrownBy(()->wall.like(1L,1L,c,true)).hasMessageContaining("404");
    }
    @Test void likesReportsAndReviewRevision(){
        publish();wall.like(1L,2L,id,true);wall.like(1L,2L,id,true);assertThat(wall.get(1L,2L,id).likes()).isEqualTo(1);
        assertThatThrownBy(()->wall.like(1L,1L,id,true)).hasMessageContaining("400");
        assertThatThrownBy(()->wall.like(2L,2L,id,true)).hasMessageContaining("404");
        wall.like(1L,2L,id,false);assertThat(wall.get(1L,2L,id).likes()).isZero();
        wall.report(1L,2L,id,"内容不实");wall.report(1L,2L,id,"内容不实");assertThat(wall.reports(1L).get(0).count()).isEqualTo(1);
        assertThatThrownBy(()->wall.review(1L,3L,id,new WallService.ReviewInput(1,"HIDDEN","过期操作"))).hasMessageContaining("409");
        wall.review(1L,3L,id,new WallService.ReviewInput(2,"HIDDEN","已处理"));assertThat(wall.reports(1L)).isEmpty();
    }
    @Test void removalAndAccountDeletionCascade(){
        publish();wall.like(1L,2L,id,true);wall.report(1L,2L,id,"其他问题");wall.comment(1L,2L,id,new WallService.CommentInput(UUID.randomUUID().toString(),"学习交流"));
        assertThatThrownBy(()->wall.remove(1L,2L,id)).hasMessageContaining("404");
        jdbc.update("DELETE FROM users WHERE id=1");
        for(String table:new String[]{"campus_wall_entries","campus_wall_likes","campus_wall_reports"})assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM "+table,Integer.class)).isZero();
    }
    @Test void sensitiveIdentifiersRejectedAndThrottleBounded(){
        for(String value:java.util.List.of("１３８ ００１３ ８０００","user@example.com","110101200001011234"))assertThatThrownBy(()->wall.create(1L,1L,new WallService.Input(UUID.randomUUID().toString(),"course","私密信息",value))).hasMessageContaining("400");
        WallThrottle t=new WallThrottle();for(int i=0;i<12;i++)t.check(1L);assertThatThrownBy(()->t.check(1L)).hasMessageContaining("429");assertThatCode(()->t.check(2L)).doesNotThrowAnyException();
    }
}
