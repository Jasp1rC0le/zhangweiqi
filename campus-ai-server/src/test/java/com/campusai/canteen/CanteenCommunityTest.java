package com.campusai.canteen;

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
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import static org.assertj.core.api.Assertions.*;

@SpringJUnitConfig(CanteenCommunityTest.Config.class)
class CanteenCommunityTest {
    @Configuration @EnableTransactionManagement static class Config {
        @Bean DataSource dataSource() { return new DriverManagerDataSource("jdbc:h2:mem:canteencommunity;MODE=MySQL;DB_CLOSE_DELAY=-1", "sa", ""); }
        @Bean JdbcTemplate jdbc(DataSource source) { return new JdbcTemplate(source); }
        @Bean PlatformTransactionManager tx(DataSource source) { return new DataSourceTransactionManager(source); }
        @Bean CanteenService service(JdbcTemplate jdbc) { return new CanteenService(jdbc); }
    }
    @Autowired JdbcTemplate jdbc;
    @Autowired CanteenService service;
    @BeforeEach void setup() throws Exception {
        jdbc.execute("DROP ALL OBJECTS");
        jdbc.execute("CREATE TABLE schools(id BIGINT PRIMARY KEY)");
        jdbc.execute("CREATE TABLE users(id BIGINT PRIMARY KEY)");
        jdbc.update("INSERT INTO schools VALUES(1),(2)");
        jdbc.update("INSERT INTO users VALUES(1),(2),(3)");
        String schema = new ClassPathResource("schema.sql").getContentAsString(StandardCharsets.UTF_8);
        String segment = schema.substring(schema.indexOf("CREATE TABLE IF NOT EXISTS campus_canteens"),schema.indexOf("CREATE TABLE IF NOT EXISTS knowledge_chunks"));
        // SQL comments contain semicolons in Chinese text; split only statement boundaries.
        for (String sql : segment.split(";\\s*(?=CREATE|$)")) if (!sql.isBlank()) jdbc.execute(sql);
        jdbc.update("INSERT INTO campus_canteens(id,school_id,name,status) VALUES(1,1,'本校食堂','PUBLISHED'),(2,2,'外校食堂','PUBLISHED')");
        jdbc.update("INSERT INTO campus_canteen_merchants(id,school_id,canteen_id,name,status) VALUES(1,1,1,'面馆','PUBLISHED'),(2,2,2,'外校商家','PUBLISHED')");
    }
    private long approve() {
        service.rate(1L,1L,1L,5,"汤热面香");
        long id = service.reviews(1L,1L,1L).get(0).id();
        service.reviewStatus(1L,id,"PUBLISHED");
        return id;
    }
    @Test void pendingReviewsArePrivateAndNotFeatured() {
        service.rate(1L,1L,1L,5,"汤热面香");
        assertThat(service.reviews(1L,2L,1L)).isEmpty();
        assertThat(service.reviews(1L,1L,1L)).singleElement().satisfies(r -> assertThat(r.status()).isEqualTo("PENDING"));
        assertThat(service.publishedMerchants(1L,2L)).singleElement().satisfies(m -> {
            assertThat(m.featuredReview()).isNull(); assertThat(m.ratingCount()).isEqualTo(1);
        });
    }
    @Test void likesAreIdempotentReversibleAndCannotBeSelfOrCrossSchool() {
        long id = approve();
        service.like(1L,2L,1L,id,true); service.like(1L,2L,1L,id,true);
        assertThat(service.publishedMerchants(1L,2L).get(0).featuredReview().likes()).isEqualTo(1);
        assertThat(service.reviews(1L,2L,1L).get(0).liked()).isTrue();
        assertThatThrownBy(() -> service.like(1L,1L,1L,id,true)).hasMessageContaining("自己的");
        assertThatThrownBy(() -> service.like(2L,2L,1L,id,true)).hasMessageContaining("404");
        assertThatThrownBy(() -> service.like(2L,2L,2L,id,true)).hasMessageContaining("404");
        service.like(1L,2L,1L,id,false); service.like(1L,2L,1L,id,false);
        assertThat(service.reviews(1L,2L,1L).get(0).likes()).isZero();
    }
    @Test void changedTextResetsApprovalAndLikesButScoreOnlyDoesNot() {
        long id = approve(); service.like(1L,2L,1L,id,true);
        service.rate(1L,1L,1L,4,null);
        assertThat(service.reviews(1L,2L,1L).get(0).likes()).isEqualTo(1);
        service.rate(1L,1L,1L,4,"这次稍咸");
        assertThat(service.reviews(1L,2L,1L)).isEmpty();
        assertThat(service.reviews(1L,1L,1L).get(0).likes()).isZero();
        assertThatThrownBy(() -> service.like(1L,2L,1L,id,true)).hasMessageContaining("404");
        assertThat(service.publishedMerchants(1L,1L).get(0).ratingCount()).isEqualTo(1);
    }
    @Test void hidingRemovesFeaturedAndAccountDeletionCascades() {
        long id = approve(); service.like(1L,2L,1L,id,true);
        service.reviewStatus(1L,id,"HIDDEN");
        assertThat(service.publishedMerchants(1L,2L).get(0).featuredReview()).isNull();
        assertThatThrownBy(() -> service.like(1L,2L,1L,id,true)).hasMessageContaining("404");
        jdbc.update("DELETE FROM users WHERE id=2");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM campus_review_likes",Integer.class)).isZero();
        jdbc.update("DELETE FROM users WHERE id=1");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM campus_merchant_reviews",Integer.class)).isZero();
    }
    @Test void privateIdentifiersRejectedBeforeAnyRatingMutation() {
        for (String text : java.util.List.of("联系13800138000", "邮箱demo@example.com", "全角１３８００１３８０００", "a".repeat(501))) {
            assertThatThrownBy(() -> service.rate(1L,1L,1L,5,text)).hasMessageContaining("400");
        }
        assertThat(service.publishedMerchants(1L,1L).get(0).ratingCount()).isZero();
    }
    @Test void explicitBlankDeletesCommentAndItsVotesNotRating() {
        long id = approve(); service.like(1L,2L,1L,id,true);
        service.rate(1L,1L,1L,4,"  ");
        assertThat(service.reviews(1L,1L,1L)).isEmpty();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM campus_review_likes",Integer.class)).isZero();
        assertThat(service.publishedMerchants(1L,1L).get(0).ratingCount()).isEqualTo(1);
    }
    @Test void writeThrottleSeparatesAccountsAndBoundsBursts() {
        CanteenWriteThrottle throttle = new CanteenWriteThrottle(Clock.fixed(Instant.parse("2026-01-01T00:00:00Z"),ZoneOffset.UTC));
        for (int i=0;i<30;i++) throttle.check(1L);
        assertThatThrownBy(() -> throttle.check(1L)).hasMessageContaining("429");
        assertThatCode(() -> throttle.check(2L)).doesNotThrowAnyException();
    }
    @Test void staleModeratorCannotApproveReplacementText() {
        long id=approve();
        service.rate(1L,1L,1L,4,"后来修改了内容");
        assertThatThrownBy(() -> service.reviewStatus(1L,id,"PUBLISHED","汤热面香")).hasMessageContaining("409");
        assertThat(service.reviews(1L,2L,1L)).isEmpty();
        service.reviewStatus(1L,id,"PUBLISHED","后来修改了内容");
        assertThat(service.reviews(1L,2L,1L).get(0).comment()).isEqualTo("后来修改了内容");
    }
    @Test void concurrentRetriesStillProduceOneVote() throws Exception {
        long id=approve();
        var executor=java.util.concurrent.Executors.newFixedThreadPool(4);
        try {
            var calls=new java.util.ArrayList<java.util.concurrent.Callable<Void>>();
            for(int i=0;i<8;i++) calls.add(()->{ service.like(1L,2L,1L,id,true);return null; });
            for(var result:executor.invokeAll(calls)) result.get();
        } finally { executor.shutdownNow(); }
        assertThat(service.reviews(1L,2L,1L).get(0).likes()).isEqualTo(1);
    }
    @Test void unchangedTextPreservesVotesAndChinesePunctuation() {
        service.rate(1L,1L,1L,5,"面，真香！");
        long id=service.reviews(1L,1L,1L).get(0).id();
        service.reviewStatus(1L,id,"PUBLISHED","面，真香！");
        service.like(1L,2L,1L,id,true);
        service.rate(1L,1L,1L,4,"面，真香！");
        assertThat(service.reviews(1L,2L,1L).get(0).likes()).isEqualTo(1);
        assertThat(service.reviews(1L,2L,1L).get(0).comment()).isEqualTo("面，真香！");
    }
}
