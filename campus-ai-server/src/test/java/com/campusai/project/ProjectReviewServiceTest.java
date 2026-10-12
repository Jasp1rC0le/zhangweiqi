package com.campusai.project;

import tools.jackson.databind.ObjectMapper;
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
import java.util.List;
import java.util.UUID;
import static org.assertj.core.api.Assertions.*;

@SpringJUnitConfig(ProjectReviewServiceTest.Config.class)
class ProjectReviewServiceTest {
    @Configuration @EnableTransactionManagement static class Config {
        @Bean DataSource dataSource(){return new DriverManagerDataSource("jdbc:h2:mem:reviewtests;MODE=MySQL;DB_CLOSE_DELAY=-1","sa","");}
        @Bean JdbcTemplate jdbc(DataSource source){return new JdbcTemplate(source);}
        @Bean PlatformTransactionManager transactions(DataSource source){return new DataSourceTransactionManager(source);}
        @Bean ProjectService projects(JdbcTemplate jdbc){return new ProjectService(jdbc,new ObjectMapper());}
        @Bean ProjectReviewService reviews(JdbcTemplate jdbc,ProjectService projects){return new ProjectReviewService(jdbc,projects,new ObjectMapper());}
    }
    @Autowired JdbcTemplate jdbc; @Autowired ProjectService projects; @Autowired ProjectReviewService reviews;
    String projectId;
    @BeforeEach void setup() throws Exception {
        jdbc.execute("DROP ALL OBJECTS");
        jdbc.execute("CREATE TABLE users(id BIGINT PRIMARY KEY,username VARCHAR(50),school_id BIGINT,status INT)");
        jdbc.update("INSERT INTO users VALUES(1,'owner',1,1),(2,'reviewer',1,1),(3,'stranger',1,1),(4,'other-school',2,1)");
        String schema=new ClassPathResource("schema.sql").getContentAsString(StandardCharsets.UTF_8);
        for(String sql:schema.substring(schema.indexOf("CREATE TABLE IF NOT EXISTS student_projects"),schema.indexOf("CREATE TABLE IF NOT EXISTS campus_wall_entries")).split(";"))if(!sql.isBlank())jdbc.execute(sql);
        projectId=UUID.randomUUID().toString();
        var requirement=new ProjectContent.Requirement("r1","课程要求",0,"",true,true,"本人正文","私有答辩备注");
        var feedback=new ProjectContent.ReviewFeedback("r1","规则反馈","a".repeat(64),"私有反馈");
        projects.create(1L,projectId,new ProjectContent("项目","general",null,"任务","本人正文",List.of(requirement),new ProjectContent.DataSheet("a,b\n1,2","原始数据",-1,-1,"",false,new java.math.BigDecimal("5")),List.of(feedback)));
    }
    @Test void minimalSnapshotIsRecipientBoundAndNeverIncludesPrivateNotes() {
        String id=UUID.randomUUID().toString();
        reviews.create(1L,projectId,id,1,"reviewer",false,false);
        var detail=reviews.get(2L,id);
        assertThat(detail.canReview()).isTrue();
        assertThat(detail.content().brief()).isEqualTo("任务");
        assertThat(detail.content().manuscript()).isEmpty();
        assertThat(detail.content().dataSheet()).isNull();
        assertThat(detail.content().reviewFeedback()).isNull();
        assertThat(detail.content().requirements().get(0).note()).isEmpty();
        assertThat(detail.content().requirements().get(0).evidence()).isEmpty();
        assertThatThrownBy(()->reviews.get(3L,id)).hasMessageContaining("404");
        assertThatThrownBy(()->reviews.outgoing(3L,projectId)).hasMessageContaining("404");
        assertThat(reviews.incoming(3L)).isEmpty();
        assertThatThrownBy(()->reviews.review(1L,id,"伪造对方意见","")).hasMessageContaining("404");
    }
    @Test void optInSnapshotIsImmutableAndInvitationRetriesAreIdempotent() {
        String id=UUID.randomUUID().toString();
        reviews.create(1L,projectId,id,1,"reviewer",true,true);
        reviews.create(1L,projectId,id,1,"reviewer",true,true);
        assertThat(reviews.outgoing(1L,projectId)).hasSize(1);
        assertThatThrownBy(()->reviews.create(1L,projectId,id,1,"reviewer",false,false)).hasMessageContaining("409");
        projects.save(1L,projectId,1,new ProjectContent("新标题","general",null,"新任务","新材料",List.of()),false);
        var snapshot=reviews.get(2L,id).content();
        assertThat(snapshot.manuscript()).isEqualTo("本人正文");
        assertThat(snapshot.dataSheet().csv()).isEqualTo("a,b\n1,2");
        assertThat(snapshot.requirements().get(0).note()).isEmpty();
        reviews.review(2L,id,"请核对来源","");
        assertThat(reviews.outgoing(1L,projectId).get(0).reviewNote()).isEqualTo("请核对来源");
        assertThat(projects.get(1L,projectId).revision()).isEqualTo(2);
    }
    @Test void revocationAndExpiryBlockReadsAndWritesAndDeletionCascades() {
        String id=UUID.randomUUID().toString();reviews.create(1L,projectId,id,1,"reviewer",true,true);
        assertThatThrownBy(()->reviews.revoke(3L,projectId,id)).hasMessageContaining("404");
        reviews.revoke(1L,projectId,id);
        assertThatThrownBy(()->reviews.get(2L,id)).hasMessageContaining("404");
        assertThatThrownBy(()->reviews.review(2L,id,"晚到意见","")).hasMessageContaining("404");
        assertThat(jdbc.queryForObject("SELECT snapshot_json FROM project_reviews WHERE id=?",String.class,id)).isEqualTo("{}");
        String expired=UUID.randomUUID().toString();reviews.create(1L,projectId,expired,1,"reviewer",false,false);
        jdbc.update("UPDATE project_reviews SET expires_at='2020-01-01' WHERE id=?",expired);
        assertThatThrownBy(()->reviews.get(2L,expired)).hasMessageContaining("404");
        assertThat(reviews.incoming(2L)).isEmpty();
        projects.delete(1L,projectId,1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM project_reviews",Integer.class)).isZero();
    }
    @Test void recipientsMustBeOtherActiveSameSchoolAccountsAndCannotInviteFromAnotherOwnersProject() {
        for(String name:List.of("owner","other-school","missing"))assertThatThrownBy(()->reviews.create(1L,projectId,UUID.randomUUID().toString(),1,name,false,false)).hasMessageContaining("核对");
        assertThatThrownBy(()->reviews.create(3L,projectId,UUID.randomUUID().toString(),1,"reviewer",true,true)).hasMessageContaining("404");
        String id=UUID.randomUUID().toString();reviews.create(1L,projectId,id,1,"reviewer",false,false);
        jdbc.update("UPDATE users SET status=0 WHERE id=1");
        assertThatThrownBy(()->reviews.get(2L,id)).hasMessageContaining("404");
    }

    @Test void expiryCleanupErasesOnlyExpiredSharedCopiesAndLeavesOriginalProject() {
        String expired=UUID.randomUUID().toString();
        String live=UUID.randomUUID().toString();
        reviews.create(1L,projectId,expired,1,"reviewer",true,true);
        reviews.create(1L,projectId,live,1,"reviewer",true,true);
        reviews.review(2L,expired,"私人意见","");
        jdbc.update("UPDATE project_reviews SET expires_at='2020-01-01' WHERE id=?",expired);
        var cleanup=new ExpiredReviewCleanup(jdbc);
        assertThat(cleanup.cleanup()).isEqualTo(1);
        assertThat(cleanup.cleanup()).isZero();
        assertThat(jdbc.queryForObject("SELECT snapshot_json FROM project_reviews WHERE id=?",String.class,expired)).isEqualTo("{}");
        assertThat(jdbc.queryForObject("SELECT review_note FROM project_reviews WHERE id=?",String.class,expired)).isEmpty();
        assertThat(reviews.get(2L,live).content().manuscript()).isEqualTo("本人正文");
        assertThat(projects.version(1L,projectId,1).manuscript()).isEqualTo("本人正文");
    }
    @Test void staleEditsCannotOverwriteAndExactNetworkRetriesSucceed() {
        String id=UUID.randomUUID().toString();reviews.create(1L,projectId,id,1,"reviewer",false,false);
        assertThat(reviews.get(2L,id).noteConcurrencyVersion()).isEqualTo(1);
        reviews.review(2L,id,"  第一版  ","");
        reviews.review(2L,id,"第一版","");
        assertThatThrownBy(()->reviews.review(2L,id,"另一页面的意见","")).hasMessageContaining("409");
        assertThatThrownBy(()->reviews.review(2L,id,"新意见",null)).hasMessageContaining("400");
        reviews.review(2L,id,"第二版","第一版");
        assertThat(reviews.get(2L,id).entry().reviewNote()).isEqualTo("第二版");
        reviews.review(2L,id,"ABC","第二版");
        assertThatThrownBy(()->reviews.review(2L,id,"覆盖","abc")).hasMessageContaining("409");
    }
    @Test @org.junit.jupiter.api.Timeout(15) void concurrentDifferentEditsHaveOnlyOneWinner() throws Exception {
        String id=UUID.randomUUID().toString();reviews.create(1L,projectId,id,1,"reviewer",false,false);
        var executor=java.util.concurrent.Executors.newFixedThreadPool(2);
        var ready=new java.util.concurrent.CountDownLatch(2);var go=new java.util.concurrent.CountDownLatch(1);
        try {
            var calls=java.util.stream.Stream.of("意见A","意见B").map(note->executor.submit(()->{
                ready.countDown();if(!go.await(3,java.util.concurrent.TimeUnit.SECONDS))throw new IllegalStateException("test timeout");
                try {reviews.review(2L,id,note,"");return 200;}
                catch(org.springframework.web.server.ResponseStatusException e){return e.getStatusCode().value();}
            })).toList();
            assertThat(ready.await(3,java.util.concurrent.TimeUnit.SECONDS)).isTrue();go.countDown();
            assertThat(List.of(calls.get(0).get(5,java.util.concurrent.TimeUnit.SECONDS),calls.get(1).get(5,java.util.concurrent.TimeUnit.SECONDS)))
                .containsExactlyInAnyOrder(200,409);
        } finally {go.countDown();executor.shutdownNow();}
    }
}
