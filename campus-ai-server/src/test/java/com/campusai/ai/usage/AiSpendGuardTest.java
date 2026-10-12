package com.campusai.ai.usage;

import com.campusai.ai.model.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import javax.sql.DataSource;
import java.math.BigDecimal;
import java.util.List;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.*;

@SpringJUnitConfig(AiSpendGuardTest.Config.class)
class AiSpendGuardTest {
    @Configuration @EnableTransactionManagement(proxyTargetClass = true) static class Config {
        @Bean DataSource ds() { return new DriverManagerDataSource("jdbc:h2:mem:spend;MODE=MySQL;DB_CLOSE_DELAY=-1;LOCK_TIMEOUT=10000", "sa", ""); }
        @Bean JdbcTemplate jdbc(DataSource ds) { return new JdbcTemplate(ds); }
        @Bean PlatformTransactionManager tx(DataSource ds) { return new DataSourceTransactionManager(ds); }
        @Bean AiCostEstimator prices() { return new AiCostEstimator("2", "8", "9", "27", "", "", "", ""); }
        @Bean AiSpendGuard guard(JdbcTemplate jdbc, AiCostEstimator prices) {
            return new AiSpendGuard(jdbc, prices, true, new BigDecimal("0.05"), new BigDecimal("0.10"), 4096);
        }
    }
    @Autowired JdbcTemplate jdbc;
    @Autowired AiSpendGuard guard;
    private static final List<AiChatMessage> INPUT = List.of(new AiChatMessage("user", "测试"));

    @BeforeEach void setup() throws Exception {
        jdbc.execute("DROP ALL OBJECTS");
        String schema = new String(getClass().getResourceAsStream("/schema.sql").readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
        for (String statement : schema.substring(schema.indexOf("CREATE TABLE IF NOT EXISTS ai_spend_buckets")).split(";")) {
            if (!statement.isBlank()) jdbc.execute(statement);
        }
    }

    @Test void settlesExactlyOnceAndUsesSnapshotRate() {
        var ticket = guard.reserve("deepseek", "deepseek-flash", INPUT, 1000);
        guard.complete(ticket, new AiModelResult("deepseek", "deepseek-flash", "好", 100, 50, 150));
        guard.complete(ticket, new AiModelResult("deepseek", "deepseek-flash", "好", 1000, 500, 1500));
        guard.failed(ticket);
        var today = guard.overview().today();
        assertThat(today.attempts()).isEqualTo(1);
        assertThat(today.completed()).isEqualTo(1);
        assertThat(today.occupiedCny()).isEqualByComparingTo("0.0006");
        assertThat(today.estimatedCny()).isEqualByComparingTo("0.0006");
        assertThat(jdbc.queryForList("SELECT charged_cny FROM ai_spend_buckets", BigDecimal.class))
                .allSatisfy(value -> assertThat(value).isEqualByComparingTo("0.0006"));
    }

    @Test void dailyExportSeparatesKnownEstimatesAndUnknownReservations() {
        var first = guard.reserve("deepseek", "deepseek-flash", INPUT, 1000);
        guard.complete(first, new AiModelResult("deepseek", "deepseek-flash", "private", 100, 50, 150));
        guard.failed(guard.reserve("deepseek", "deepseek-flash", INPUT, 1000));
        var date = java.time.LocalDate.now(java.time.ZoneId.of("Asia/Shanghai"));
        var rows = guard.dailyCosts(date, date.plusDays(1));
        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).attempts()).isEqualTo(2);
        assertThat(rows.get(0).unresolved()).isEqualTo(1);
        assertThat(rows.get(0).estimatedCny()).isEqualByComparingTo("0.0006");
        assertThat(rows.get(0).occupiedCny()).isGreaterThan(rows.get(0).estimatedCny());
        assertThatThrownBy(() -> guard.dailyCosts(date.minusDays(32), date)).hasMessageContaining("400");
        assertThatThrownBy(() -> guard.dailyCosts(date, date.plusDays(2))).hasMessageContaining("400");
        assertThatThrownBy(() -> guard.dailyCosts(date, date)).hasMessageContaining("400");
    }

    @Test void failureAndMissingUsageKeepReservations() {
        var failed = guard.reserve("deepseek", "deepseek-flash", INPUT, 1000);
        var unknown = guard.reserve("deepseek", "deepseek-flash", INPUT, 1000);
        var inconsistent = guard.reserve("deepseek", "deepseek-flash", INPUT, 1000);
        var held = guard.overview().today().occupiedCny();
        guard.failed(failed);
        guard.complete(unknown, new AiModelResult("deepseek", "deepseek-flash", "好", null, null, null));
        guard.complete(inconsistent, new AiModelResult("deepseek", "deepseek-flash", "好", 1, 1, 999));
        assertThat(guard.overview().today().occupiedCny()).isEqualByComparingTo(held);
        assertThat(guard.overview().today().estimatedCny()).isZero();
        assertThat(guard.overview().today().unresolved()).isEqualTo(3);
        assertThat(guard.overview().today().failed()).isEqualTo(1);
    }

    @Test void dailyRejectionRollsBackMonthlyDebitAndLedger() {
        assertThatThrownBy(() -> guard.reserve("deepseek", "deepseek-flash", INPUT, 7000)).hasMessageContaining("429");
        assertThat(guard.overview().month().attempts()).isZero();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM ai_spend_buckets", Integer.class)).isZero();
    }

    @Test void monthlyCapStillAppliesWithEmptyDailyBucket() {
        var month = "M:" + java.time.LocalDate.now(java.time.ZoneId.of("Asia/Shanghai")).toString().substring(0, 7);
        jdbc.update("INSERT INTO ai_spend_buckets VALUES (?, 0.10)", month);
        assertThatThrownBy(() -> guard.reserve("deepseek", "deepseek-flash", INPUT, 1000)).hasMessageContaining("本月");
        assertThat(guard.overview().today().attempts()).isZero();
    }

    @Test void concurrentRequestsCannotOverReserve() throws Exception {
        var pool = Executors.newFixedThreadPool(8);
        try {
            var tasks = new java.util.ArrayList<Callable<Boolean>>();
            for (int i = 0; i < 20; i++) tasks.add(() -> {
                try { guard.reserve("deepseek", "deepseek-flash", INPUT, 1000); return true; }
                catch (org.springframework.web.server.ResponseStatusException ex) {
                    assertThat(ex.getStatusCode().value()).isEqualTo(429); return false;
                }
            });
            long accepted = 0;
            for (var future : pool.invokeAll(tasks)) if (future.get()) accepted++;
            assertThat(accepted).isBetween(1L, 6L);
            assertThat(guard.overview().today().occupiedCny()).isLessThanOrEqualTo(new BigDecimal("0.05"));
            assertThat(guard.overview().today().attempts()).isEqualTo(accepted);
        } finally { pool.shutdownNow(); }
    }

    @Test void unknownPricesAndOversizedInputFailBeforeLedger() {
        assertThatThrownBy(() -> guard.reserve("kimi", "kimi-k3", INPUT, 1000)).hasMessageContaining("503");
        assertThatThrownBy(() -> guard.reserve("deepseek", "deepseek-flash",
                List.of(new AiChatMessage("user", "中".repeat(2000))), 1000)).hasMessageContaining("413");
        assertThat(guard.overview().today().attempts()).isZero();
    }

    @Test void failedLedgerWriteRollsBackBudget() {
        jdbc.execute("DROP TABLE ai_provider_attempts");
        assertThatThrownBy(() -> guard.reserve("deepseek", "deepseek-flash", INPUT, 1000)).isInstanceOf(RuntimeException.class);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM ai_spend_buckets", Integer.class)).isZero();
    }
}
