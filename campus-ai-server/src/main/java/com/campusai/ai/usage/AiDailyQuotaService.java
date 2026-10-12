package com.campusai.ai.usage;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.sql.Date;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.UUID;
import java.util.List;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.annotation.Propagation;

@Service
public class AiDailyQuotaService implements AiCallAdmission {
    private static final ZoneId SCHOOL_ZONE = ZoneId.of("Asia/Shanghai");
    private final JdbcTemplate jdbc;
    private final int limit;

    public AiDailyQuotaService(JdbcTemplate jdbc,
            @Value("${app.ai.daily-token-limit:60000}") int limit) {
        if (limit < 1) throw new IllegalArgumentException("每日额度必须大于0");
        this.jdbc = jdbc;
        this.limit = limit;
    }

    @Override
    @Transactional(propagation=Propagation.REQUIRES_NEW)
    public void reserve(Long userId) {
        reserve(userId, 1200);
    }

    @Override
    @Transactional(propagation=Propagation.REQUIRES_NEW)
    public void reserve(Long userId, int estimatedTokens) {
        reserveTokens(userId, estimatedTokens);
    }

    @Override
    @Transactional(propagation=Propagation.REQUIRES_NEW)
    public Reservation reserveTokens(Long userId, int estimatedTokens) {
        if (estimatedTokens < 1) throw new IllegalArgumentException("预留Token必须大于0");
        boolean unlimited = isActiveAdministrator(userId);
        Date day = Date.valueOf(LocalDate.now(SCHOOL_ZONE));
        jdbc.update("INSERT IGNORE INTO ai_daily_token_quota (user_id, usage_date, used_tokens) "
                + "VALUES (?, ?, 0)", userId, day);
        // Exempt only the account's daily allowance. Keep reservations, actual usage,
        // provider spend guards and request throttles for administrator tests too.
        int updated = unlimited
                ? jdbc.update("UPDATE ai_daily_token_quota SET used_tokens = used_tokens + ? "
                        + "WHERE user_id = ? AND usage_date = ?", estimatedTokens, userId, day)
                : jdbc.update("UPDATE ai_daily_token_quota SET used_tokens = used_tokens + ? "
                + "WHERE user_id = ? AND usage_date = ? AND used_tokens + ? <= ?",
                estimatedTokens, userId, day, estimatedTokens, limit);
        if (updated != 1) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                    "今天的AI Token额度不足，明天00:00（北京时间）恢复");
        }
        String id=UUID.randomUUID().toString();
        jdbc.update("INSERT INTO ai_token_reservations(id,user_id,usage_date,reserved_tokens,state) VALUES(?,?,?,?,'RESERVED')",id,userId,day,estimatedTokens);
        return new Reservation(day.toLocalDate(), estimatedTokens,id);
    }

    @Override
    @Transactional(propagation=Propagation.REQUIRES_NEW)
    public void settle(Long userId, Reservation reservation, int actualTokens) {
        finish(userId,reservation,Math.max(1,actualTokens),"SETTLED");
    }

    @Override
    @Transactional(propagation=Propagation.REQUIRES_NEW)
    public void release(Long userId, Reservation reservation) {
        finish(userId,reservation,0,"RELEASED");
    }
    private record Reserved(Date day,int tokens,String state) {}
    private void finish(Long userId,Reservation reservation,int actual,String state) {
        if(reservation==null||reservation.id()==null)return;
        var rows=jdbc.query("SELECT usage_date,reserved_tokens,state FROM ai_token_reservations WHERE id=? AND user_id=? FOR UPDATE",(rs,n)->new Reserved(rs.getDate("usage_date"),rs.getInt("reserved_tokens"),rs.getString("state")),reservation.id(),userId);
        if(rows.isEmpty()||!rows.get(0).state().equals("RESERVED"))return;
        Reserved stored=rows.get(0);
        jdbc.update("UPDATE ai_token_reservations SET actual_tokens=?,state=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?",actual,state,reservation.id(),userId);
        jdbc.update("UPDATE ai_daily_token_quota SET used_tokens=GREATEST(0,used_tokens+?) WHERE user_id=? AND usage_date=?",actual-stored.tokens(),userId,stored.day());
    }
    public record Activity(java.time.LocalDateTime createdAt,Date usageDate,int reservedTokens,Integer actualTokens,String state) {}
    public List<Activity> activity(Long userId) {
        return jdbc.query("SELECT created_at,usage_date,reserved_tokens,actual_tokens,state FROM ai_token_reservations WHERE user_id=? ORDER BY created_at DESC,id DESC LIMIT 50",(rs,n)->new Activity(rs.getTimestamp("created_at").toLocalDateTime(),rs.getDate("usage_date"),rs.getInt("reserved_tokens"),(Integer)rs.getObject("actual_tokens"),rs.getString("state")),userId);
    }

    public DailyQuota status(Long userId) {
        boolean unlimited = isActiveAdministrator(userId);
        Date day = Date.valueOf(LocalDate.now(SCHOOL_ZONE));
        Integer used = jdbc.queryForObject("SELECT COALESCE(MAX(used_tokens), 0) "
                + "FROM ai_daily_token_quota WHERE user_id = ? AND usage_date = ?",
                Integer.class, userId, day);
        int count = used == null ? 0 : used;
        return new DailyQuota(day.toLocalDate(), count, unlimited ? null : limit,
                unlimited ? null : Math.max(0, limit - count), "tokens", unlimited);
    }

    private boolean isActiveAdministrator(Long userId) {
        if (userId == null) return false;
        // Never trust a client role or cached entitlement; role changes apply on the next call.
        Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM users WHERE id = ? "
                + "AND status = 1 AND role = 'ADMIN'", Integer.class, userId);
        return count != null && count == 1;
    }

    public record DailyQuota(LocalDate date, int used, Integer limit, Integer remaining,
            String unit, boolean unlimited) {}
}
