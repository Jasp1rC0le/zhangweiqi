package com.campusai.ai.usage;

import com.campusai.ai.model.AiChatMessage;
import com.campusai.ai.model.AiModelResult;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.UUID;

/** Durable platform-wide admission. No prompts, account identifiers or API keys are stored here. */
@Service
public class AiSpendGuard {
    private final JdbcTemplate jdbc;
    private final AiCostEstimator pricing;
    private final boolean enabled;
    private final BigDecimal dailyLimit;
    private final BigDecimal monthlyLimit;
    private final int inputByteLimit;

    public AiSpendGuard(JdbcTemplate jdbc, AiCostEstimator pricing,
            @Value("${app.ai.budget.enabled:false}") boolean enabled,
            @Value("${app.ai.budget.daily-cny:10}") BigDecimal dailyLimit,
            @Value("${app.ai.budget.monthly-cny:200}") BigDecimal monthlyLimit,
            @Value("${app.ai.budget.max-input-bytes:48000}") int inputByteLimit) {
        if (dailyLimit.signum() <= 0 || monthlyLimit.signum() <= 0 || inputByteLimit < 1024) {
            throw new IllegalArgumentException("模型预算须大于 0，输入限制至少为 1024 字节");
        }
        this.jdbc = jdbc; this.pricing = pricing; this.enabled = enabled;
        this.dailyLimit = dailyLimit; this.monthlyLimit = monthlyLimit; this.inputByteLimit = inputByteLimit;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public Ticket reserve(String provider, String model, List<AiChatMessage> messages, int outputLimit) {
        if (!enabled) return null;
        // UTF-8 bytes plus message overhead is deliberately more conservative than chars/2.
        long inputBound = 256;
        for (AiChatMessage message : messages) {
            inputBound += 32L + (message.content() == null ? 0
                    : message.content().getBytes(StandardCharsets.UTF_8).length);
        }
        if (inputBound > inputByteLimit || outputLimit < 1) {
            throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE,
                    "这段对话已超过免费版单次上下文容量，请新建对话或精简附件后重试");
        }
        return reserveBound(provider, model, inputBound, outputLimit);
    }

    /** Trusted provider tokenizer estimate, never the Base64 byte count or a client-supplied value. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public Ticket reserveVision(String provider, String model, int inputTokens, int outputLimit) {
        if (inputTokens < 1 || inputTokens > inputByteLimit || outputLimit < 1)
            throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "图片上下文过大，请裁剪后重试");
        if (!enabled) return null;
        return reserveBound(provider, model, inputTokens, outputLimit);
    }

    private Ticket reserveBound(String provider, String model, long inputBound, int outputLimit) {
        BigDecimal held = pricing.estimate(provider, model, inputBound, (long) outputLimit);
        if (held == null || held.signum() <= 0) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "该模型尚未完成成本配置，暂未开放，请使用其他模式");
        }
        LocalDate day = LocalDate.now(ZoneId.of("Asia/Shanghai"));
        String monthKey = "M:" + day.toString().substring(0, 7);
        String dayKey = "D:" + day;
        // Every request locks month then day. Limits include unresolved and concurrent requests.
        debit(monthKey, monthlyLimit, held);
        debit(dayKey, dailyLimit, held);
        String id = UUID.randomUUID().toString();
        jdbc.update("""
                INSERT INTO ai_provider_attempts
                (id, usage_date, provider, requested_model, state, reserved_cny, charged_cny,
                 input_rate, output_rate)
                VALUES (?, ?, ?, ?, 'PENDING', ?, ?, ?, ?)
                """, id, day, provider, model, held, held,
                pricing.estimate(provider, model, 1_000_000L, 0L),
                pricing.estimate(provider, model, 0L, 1_000_000L));
        return new Ticket(id);
    }

    private void debit(String key, BigDecimal limit, BigDecimal held) {
        jdbc.update("INSERT IGNORE INTO ai_spend_buckets (period_key, charged_cny) VALUES (?, 0)", key);
        int updated = jdbc.update("""
                UPDATE ai_spend_buckets SET charged_cny = charged_cny + ?
                WHERE period_key = ? AND charged_cny + ? <= ?
                """, held, key, held, limit);
        if (updated != 1) throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                key.startsWith("M:") ? "本月免费 AI 预算已用完，项目与资料工具仍可使用"
                        : "今日免费 AI 预算已用完，北京时间明日恢复，项目与资料工具仍可使用");
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void complete(Ticket ticket, AiModelResult result) {
        finish(ticket, result, false);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void failed(Ticket ticket) {
        // Timeouts and HTTP errors are not proof that the upstream incurred no charge.
        finish(ticket, null, true);
    }

    private void finish(Ticket ticket, AiModelResult result, boolean failed) {
        if (ticket == null) return;
        var rows = jdbc.query("""
                SELECT usage_date, state, charged_cny, input_rate, output_rate
                FROM ai_provider_attempts WHERE id = ? FOR UPDATE
                """, (rs, index) -> new Stored(rs.getDate(1).toLocalDate(), rs.getString(2),
                rs.getBigDecimal(3), rs.getBigDecimal(4), rs.getBigDecimal(5)), ticket.id());
        if (rows.isEmpty() || !"PENDING".equals(rows.get(0).state())) return;
        Stored stored = rows.get(0);
        boolean known = result != null && result.promptTokens() != null && result.completionTokens() != null
                && result.promptTokens() >= 0 && result.completionTokens() >= 0
                && (result.promptTokens() > 0 || result.completionTokens() > 0)
                && (result.totalTokens() == null || result.totalTokens().longValue()
                    == result.promptTokens().longValue() + result.completionTokens().longValue());
        BigDecimal estimate = known ? stored.inputRate().multiply(BigDecimal.valueOf(result.promptTokens()))
                .add(stored.outputRate().multiply(BigDecimal.valueOf(result.completionTokens())))
                .divide(BigDecimal.valueOf(1_000_000), 6, java.math.RoundingMode.HALF_UP) : null;
        BigDecimal charged = estimate == null ? stored.held() : estimate;
        BigDecimal difference = charged.subtract(stored.held());
        // An unexpected overrun is recorded in full, so subsequent requests stop, not hidden by a clamp.
        jdbc.update("UPDATE ai_spend_buckets SET charged_cny = charged_cny + ? WHERE period_key = ?",
                difference, "M:" + stored.day().toString().substring(0, 7));
        jdbc.update("UPDATE ai_spend_buckets SET charged_cny = charged_cny + ? WHERE period_key = ?",
                difference, "D:" + stored.day());
        jdbc.update("""
                UPDATE ai_provider_attempts SET state = ?, response_model = ?, prompt_tokens = ?,
                completion_tokens = ?, estimated_cny = ?, charged_cny = ?, finished_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """, failed ? "FAILED" : known ? "COMPLETE" : "UNKNOWN",
                result == null ? null : boundedModel(result.model()),
                known ? result.promptTokens() : null, known ? result.completionTokens() : null,
                estimate, charged, ticket.id());
    }

    private String boundedModel(String value) {
        return value == null ? null : value.substring(0, Math.min(value.length(), 120));
    }

    @Transactional(readOnly = true, isolation = org.springframework.transaction.annotation.Isolation.REPEATABLE_READ)
    public Overview overview() {
        LocalDate day = LocalDate.now(ZoneId.of("Asia/Shanghai"));
        return new Overview(enabled, "CNY", "Asia/Shanghai", day.toString(),
                window(day, day.plusDays(1), dailyLimit),
                window(day.withDayOfMonth(1), day.withDayOfMonth(1).plusMonths(1), monthlyLimit));
    }

    private Window window(LocalDate start, LocalDate end, BigDecimal limit) {
        return jdbc.queryForObject("""
                SELECT COUNT(*) attempts,
                COALESCE(SUM(CASE WHEN state = 'COMPLETE' THEN 1 ELSE 0 END), 0) complete_count,
                COALESCE(SUM(CASE WHEN state = 'FAILED' THEN 1 ELSE 0 END), 0) failed_count,
                COALESCE(SUM(CASE WHEN state <> 'COMPLETE' THEN 1 ELSE 0 END), 0) unresolved,
                COALESCE(SUM(prompt_tokens), 0) input_tokens,
                COALESCE(SUM(completion_tokens), 0) output_tokens,
                COALESCE(SUM(estimated_cny), 0) estimated,
                COALESCE(SUM(charged_cny), 0) charged
                FROM ai_provider_attempts WHERE usage_date >= ? AND usage_date < ?
                """, (rs, index) -> new Window(start.toString(), end.toString(), limit,
                rs.getLong("attempts"), rs.getLong("complete_count"), rs.getLong("failed_count"),
                rs.getLong("unresolved"), rs.getLong("input_tokens"), rs.getLong("output_tokens"),
                rs.getBigDecimal("estimated"), rs.getBigDecimal("charged")), start, end);
    }

    @Transactional(readOnly = true)
    public List<DailyCost> dailyCosts(LocalDate from, LocalDate until) {
        if (from == null || until == null || !until.isAfter(from)
                || java.time.temporal.ChronoUnit.DAYS.between(from, until) > 31
                || until.isAfter(LocalDate.now(ZoneId.of("Asia/Shanghai")).plusDays(1))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "请选择最多31天的日期范围，结束日期不包含在内，不能超过明日");
        }
        return jdbc.query("""
                SELECT usage_date, provider, requested_model, COUNT(*) attempts,
                SUM(CASE WHEN state <> 'COMPLETE' THEN 1 ELSE 0 END) unresolved,
                COALESCE(SUM(prompt_tokens), 0) input_tokens,
                COALESCE(SUM(completion_tokens), 0) output_tokens,
                COALESCE(SUM(estimated_cny), 0) estimated,
                COALESCE(SUM(charged_cny), 0) occupied
                FROM ai_provider_attempts WHERE usage_date >= ? AND usage_date < ?
                GROUP BY usage_date, provider, requested_model
                ORDER BY usage_date, provider, requested_model
                """, (rs, index) -> new DailyCost(rs.getDate("usage_date").toLocalDate().toString(),
                rs.getString("provider"), rs.getString("requested_model"), rs.getLong("attempts"),
                rs.getLong("unresolved"), rs.getLong("input_tokens"), rs.getLong("output_tokens"),
                rs.getBigDecimal("estimated"), rs.getBigDecimal("occupied")), from, until);
    }

    public record Ticket(String id) {}
    public record DailyCost(String date, String provider, String model, long attempts, long unresolved,
                            long inputTokens, long outputTokens, BigDecimal estimatedCny, BigDecimal occupiedCny) {}
    private record Stored(LocalDate day, String state, BigDecimal held, BigDecimal inputRate, BigDecimal outputRate) {}
    public record Window(String from, String until, BigDecimal limitCny, long attempts,
                         long completed, long failed, long unresolved, long inputTokens, long outputTokens,
                         BigDecimal estimatedCny, BigDecimal occupiedCny) {}
    public record Overview(boolean enabled, String currency, String timezone, String date, Window today, Window month) {}
}
