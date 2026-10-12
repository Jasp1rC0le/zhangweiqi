package com.campusai.ai.usage;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import javax.sql.DataSource;
import static org.assertj.core.api.Assertions.*;

@SpringJUnitConfig(TokenLedgerTest.Config.class)
class TokenLedgerTest {
    @Configuration @EnableTransactionManagement(proxyTargetClass=true) static class Config {
        @Bean DataSource ds(){return new DriverManagerDataSource("jdbc:h2:mem:ledgertests;MODE=MySQL;DB_CLOSE_DELAY=-1","sa","");}
        @Bean JdbcTemplate jdbc(DataSource ds){return new JdbcTemplate(ds);}
        @Bean PlatformTransactionManager transactions(DataSource ds){return new DataSourceTransactionManager(ds);}
        @Bean AiDailyQuotaService quota(JdbcTemplate jdbc){return new AiDailyQuotaService(jdbc,10000);}
    }
    @Autowired JdbcTemplate jdbc;@Autowired AiDailyQuotaService quota;
    @BeforeEach void setup(){jdbc.execute("DROP ALL OBJECTS");jdbc.execute("CREATE TABLE users(id BIGINT PRIMARY KEY,role VARCHAR(20),status INT)");jdbc.execute("INSERT INTO users VALUES(1,'STUDENT',1),(2,'ADMIN',1)");jdbc.execute("CREATE TABLE ai_daily_token_quota(user_id BIGINT,usage_date DATE,used_tokens INT,PRIMARY KEY(user_id,usage_date))");jdbc.execute("CREATE TABLE ai_token_reservations(id VARCHAR(36) PRIMARY KEY,user_id BIGINT,usage_date DATE,reserved_tokens INT,actual_tokens INT,state VARCHAR(16),created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)");}
    @Test void settlementAndReleaseAreIdempotentAndOwnerBound(){
        var reservation=quota.reserveTokens(1L,2000);assertThat(quota.status(1L).used()).isEqualTo(2000);
        quota.release(2L,reservation);assertThat(quota.status(1L).used()).isEqualTo(2000);
        quota.settle(1L,reservation,600);quota.settle(1L,reservation,600);quota.release(1L,reservation);
        assertThat(quota.status(1L).used()).isEqualTo(600);assertThat(quota.activity(1L).get(0).state()).isEqualTo("SETTLED");
        var failure=quota.reserveTokens(1L,1000);quota.release(1L,failure);quota.release(1L,failure);quota.settle(1L,failure,900);
        assertThat(quota.status(1L).used()).isEqualTo(600);assertThat(quota.activity(2L)).isEmpty();
    }
    @Test void settlementUsesStoredDayAndAmountNotCallerCopy(){
        var real=quota.reserveTokens(1L,2000);var changed=new AiCallAdmission.Reservation(real.date().minusDays(1),9000,real.id());
        quota.settle(1L,changed,500);assertThat(quota.status(1L).used()).isEqualTo(500);
    }
    @Test void failedLedgerWriteRollsBackReservedBalance(){
        jdbc.execute("DROP TABLE ai_token_reservations");assertThatThrownBy(()->quota.reserveTokens(1L,2000)).isInstanceOf(RuntimeException.class);
        assertThat(quota.status(1L).used()).isZero();
    }
    @Test void overBudgetCreatesNoLedgerEntry(){
        assertThatThrownBy(()->quota.reserveTokens(1L,10001)).hasMessageContaining("429");
        assertThat(quota.activity(1L)).isEmpty();assertThat(quota.status(1L).used()).isZero();
    }
    @Test void administratorCanExceedAllowanceButStillSettlesAndReleasesExactlyOnce(){
        var first=quota.reserveTokens(2L,20000);
        assertThat(quota.status(2L).unlimited()).isTrue();
        assertThat(quota.status(2L).limit()).isNull();
        assertThat(quota.status(2L).remaining()).isNull();
        assertThat(quota.status(2L).used()).isEqualTo(20000);
        quota.settle(2L,first,15000);quota.settle(2L,first,15000);
        var failed=quota.reserveTokens(2L,20000);quota.release(2L,failed);quota.release(2L,failed);
        assertThat(quota.status(2L).used()).isEqualTo(15000);
        assertThat(quota.activity(2L)).hasSize(2);
        assertThat(quota.activity(2L)).extracting(AiDailyQuotaService.Activity::state).containsExactlyInAnyOrder("SETTLED","RELEASED");
    }
    @Test void demotionOrSuspensionImmediatelyRemovesUnlimitedAllowance(){
        var inFlight=quota.reserveTokens(2L,15000);
        jdbc.update("UPDATE users SET role='STUDENT' WHERE id=2");
        assertThat(quota.status(2L).unlimited()).isFalse();
        assertThat(quota.status(2L).remaining()).isZero();
        assertThatThrownBy(()->quota.reserveTokens(2L,1)).hasMessageContaining("429");
        // Demotion must not break settlement of an already admitted request.
        quota.settle(2L,inFlight,12000);
        jdbc.update("UPDATE users SET role='ADMIN',status=0 WHERE id=2");
        assertThat(quota.status(2L).unlimited()).isFalse();
        assertThatThrownBy(()->quota.reserveTokens(2L,1)).hasMessageContaining("429");
    }
    @Test void teacherAndUnknownAccountDoNotReceiveAdministratorAllowance(){
        jdbc.update("UPDATE users SET role='TEACHER' WHERE id=1");
        assertThat(quota.status(1L).unlimited()).isFalse();
        assertThatThrownBy(()->quota.reserveTokens(1L,10001)).hasMessageContaining("429");
        assertThat(quota.status(99L).unlimited()).isFalse();
        assertThatThrownBy(()->quota.reserveTokens(99L,10001)).hasMessageContaining("429");
    }
    @Test void administratorLedgerFailureStillRollsBackBalance(){
        jdbc.execute("DROP TABLE ai_token_reservations");
        assertThatThrownBy(()->quota.reserveTokens(2L,20000)).isInstanceOf(RuntimeException.class);
        assertThat(quota.status(2L).used()).isZero();
    }
}
