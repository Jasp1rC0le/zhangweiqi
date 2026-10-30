package com.campusai.canteen;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.sql.Statement;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.HashMap;
import java.text.Normalizer;

@Service
public class CanteenService {
    private final JdbcTemplate jdbc;

    public CanteenService(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public record Canteen(Long id, String name, String status) {}
    public record Merchant(Long id, Long canteenId, String name, String location,
                           String description, String status, String operatingStatus) {}
    public record PublicMerchant(Long id, Long canteenId, String canteenName, String name,
                                 String location, String description, String operatingStatus,
                                 long ratingCount, BigDecimal averageScore, Integer myScore,
                                 long reviewCount, boolean hasPhoto, FeaturedReview featuredReview) {}
    public record FeaturedReview(Long id, String comment, long likes, boolean liked, boolean mine) {}
    public record PublicReview(Long id, int score, String comment, LocalDateTime updatedAt,
                               boolean mine, String status, long likes, boolean liked) {}
    public record LikeInput(@NotNull Boolean liked) {}
    public record AdminReview(Long id, Long merchantId, String merchantName, int score,
                              String comment, String status, LocalDateTime updatedAt, long reportCount) {
        public AdminReview(Long id, Long merchantId, String merchantName, int score, String comment, String status, LocalDateTime updatedAt) { this(id,merchantId,merchantName,score,comment,status,updatedAt,0); }
    }
    public record CanteenInput(@NotBlank @Size(max = 120) String name) {}
    public record MerchantInput(@NotNull @Positive Long canteenId,
                                @NotBlank @Size(max = 120) String name,
                                @Size(max = 120) String location,
                                @Size(max = 1000) String description) {}
    public record RatingInput(@NotNull @Min(1) @Max(5) Integer score,
                              @Size(max = 500) String comment) {}

    private static final RowMapper<Canteen> CANTEEN_ROW = (rs, rowNum) ->
            new Canteen(rs.getLong("id"), rs.getString("name"), rs.getString("status"));
    private static final RowMapper<Merchant> MERCHANT_ROW = (rs, rowNum) ->
            new Merchant(rs.getLong("id"), rs.getLong("canteen_id"), rs.getString("name"),
                    rs.getString("location"), rs.getString("description"),
                    rs.getString("status"), rs.getString("operating_status"));

    public List<Canteen> publishedCanteens(Long schoolId) {
        return jdbc.query("SELECT id, name, status FROM campus_canteens "
                + "WHERE school_id = ? AND status = 'PUBLISHED' ORDER BY id", CANTEEN_ROW, schoolId);
    }

    public List<PublicMerchant> publishedMerchants(Long schoolId, Long userId) {
        Map<Long, FeaturedReview> featured = featuredReviews(schoolId, userId);
        return jdbc.query("SELECT m.id, m.canteen_id, c.name AS canteen_name, m.name, "
                + "m.location, m.description, m.operating_status, "
                + "COALESCE(stats.rating_count, 0) AS rating_count, stats.average_score, "
                + "mine.score AS my_score, "
                + "(SELECT COUNT(*) FROM campus_merchant_reviews review "
                + "WHERE review.merchant_id = m.id AND review.status = 'PUBLISHED') AS review_count, "
                + "EXISTS(SELECT 1 FROM campus_merchant_photos photo "
                + "WHERE photo.merchant_id = m.id) AS has_photo "
                + "FROM campus_canteen_merchants m "
                + "JOIN campus_canteens c ON c.id = m.canteen_id AND c.school_id = m.school_id "
                + "LEFT JOIN (SELECT merchant_id, COUNT(*) AS rating_count, "
                + "SUM(score) AS score_sum, ROUND(AVG(score), 1) AS average_score FROM campus_merchant_ratings "
                + "GROUP BY merchant_id) stats ON stats.merchant_id = m.id "
                + "LEFT JOIN campus_merchant_ratings mine ON mine.merchant_id = m.id "
                + "AND mine.user_id = ? "
                + "WHERE m.school_id = ? AND m.status = 'PUBLISHED' "
                + "AND c.status = 'PUBLISHED' "
                + "ORDER BY CASE WHEN stats.rating_count IS NULL THEN 1 ELSE 0 END, "
                + "(stats.score_sum + 17.5) / (stats.rating_count + 5) DESC, "
                + "stats.rating_count DESC, m.id",
                (rs, rowNum) -> new PublicMerchant(rs.getLong("id"), rs.getLong("canteen_id"),
                        rs.getString("canteen_name"), rs.getString("name"),
                        rs.getString("location"), rs.getString("description"),
                        rs.getString("operating_status"), rs.getLong("rating_count"),
                        rs.getBigDecimal("average_score"),
                        rs.getObject("my_score", Integer.class), rs.getLong("review_count"),
                        rs.getBoolean("has_photo"), featured.get(rs.getLong("id"))), userId, schoolId);
    }

    // One batch query, not one extra request per merchant. Only approved text can be featured.
    private Map<Long, FeaturedReview> featuredReviews(Long schoolId, Long userId) {
        Map<Long, FeaturedReview> result = new HashMap<>();
        jdbc.query("SELECT ranked.* FROM (SELECT r.id, r.merchant_id, r.comment_text, r.user_id, "
                + "COALESCE(v.likes,0) AS likes, EXISTS(SELECT 1 FROM campus_review_likes mine "
                + "WHERE mine.review_id=r.id AND mine.user_id=?) AS liked, "
                + "ROW_NUMBER() OVER(PARTITION BY r.merchant_id ORDER BY COALESCE(v.likes,0) DESC,r.id DESC) AS rn "
                + "FROM campus_merchant_reviews r JOIN campus_canteen_merchants m ON m.id=r.merchant_id "
                + "JOIN campus_canteens c ON c.id=m.canteen_id "
                + "LEFT JOIN (SELECT review_id,COUNT(*) AS likes FROM campus_review_likes GROUP BY review_id) v ON v.review_id=r.id "
                + "WHERE r.school_id=? AND m.school_id=r.school_id AND c.school_id=r.school_id "
                + "AND r.status='PUBLISHED' AND m.status='PUBLISHED' AND c.status='PUBLISHED') ranked WHERE rn=1",
                (org.springframework.jdbc.core.RowCallbackHandler) rs -> result.put(rs.getLong("merchant_id"),
                        new FeaturedReview(rs.getLong("id"), rs.getString("comment_text"), rs.getLong("likes"),
                                rs.getBoolean("liked"), rs.getLong("user_id") == userId)), userId, schoolId);
        return result;
    }

    @Transactional
    public void rate(Long schoolId, Long userId, Long merchantId, int score) {
        rate(schoolId, userId, merchantId, score, null);
    }

    @Transactional
    public void rate(Long schoolId, Long userId, Long merchantId, int score, String comment) {
        if (score < 1 || score > 5) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "评分须为1到5分");
        }
        String normalized = normalizeComment(comment);
        Long visible = jdbc.queryForObject("SELECT COUNT(*) FROM campus_canteen_merchants m "
                + "JOIN campus_canteens c ON c.id = m.canteen_id AND c.school_id = m.school_id "
                + "WHERE m.id = ? AND m.school_id = ? AND m.status = 'PUBLISHED' "
                + "AND c.status = 'PUBLISHED'", Long.class, merchantId, schoolId);
        if (visible == null || visible == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "本校商家不存在或尚未发布");
        }
        jdbc.update("INSERT INTO campus_merchant_ratings (merchant_id, school_id, user_id, score) "
                + "VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE score = VALUES(score)",
                merchantId, schoolId, userId, score);
        if (comment != null) {
            if (normalized.isEmpty()) {
                jdbc.update("DELETE FROM campus_merchant_reviews WHERE merchant_id = ? "
                        + "AND school_id = ? AND user_id = ?", merchantId, schoolId, userId);
            } else {
                // Serialize edits with likes so a replaced comment cannot inherit its old votes.
                var previous = jdbc.query("SELECT id, comment_text FROM campus_merchant_reviews "
                                + "WHERE merchant_id=? AND school_id=? AND user_id=? FOR UPDATE",
                        (rs, n) -> Map.entry(rs.getLong("id"), rs.getString("comment_text")), merchantId, schoolId, userId);
                for (var old : previous) if (!old.getValue().equals(normalized)) {
                    jdbc.update("DELETE FROM campus_review_likes WHERE review_id=?", old.getKey());
                    jdbc.update("UPDATE campus_merchant_reviews SET comment_text=?, status='PUBLISHED' WHERE id=?",
                            normalized, old.getKey());
                }
                if (previous.isEmpty()) jdbc.update("INSERT INTO campus_merchant_reviews "
                        + "(merchant_id, school_id, user_id, comment_text, status) VALUES (?, ?, ?, ?, 'PUBLISHED')",
                        merchantId, schoolId, userId, normalized);
            }
        }
    }

    public List<PublicReview> reviews(Long schoolId, Long userId, Long merchantId) {
        requirePublishedMerchant(schoolId, merchantId);
        return jdbc.query("SELECT review.id, rating.score, review.comment_text, "
                + "review.updated_at, review.user_id = ? AS mine, review.status, "
                + "(SELECT COUNT(*) FROM campus_review_likes v WHERE v.review_id=review.id) AS likes, "
                + "EXISTS(SELECT 1 FROM campus_review_likes v WHERE v.review_id=review.id AND v.user_id=?) AS liked "
                + "FROM campus_merchant_reviews review "
                + "JOIN campus_merchant_ratings rating ON rating.merchant_id = review.merchant_id "
                + "AND rating.user_id = review.user_id "
                + "WHERE review.school_id = ? AND review.merchant_id = ? "
                + "AND (review.status = 'PUBLISHED' OR review.user_id = ?) "
                + "ORDER BY mine DESC, review.updated_at DESC, likes DESC, review.id DESC LIMIT 20",
                (rs, rowNum) -> new PublicReview(rs.getLong("id"), rs.getInt("score"),
                        rs.getString("comment_text"), rs.getTimestamp("updated_at").toLocalDateTime(),
                        rs.getBoolean("mine"), rs.getString("status"), rs.getLong("likes"), rs.getBoolean("liked")),
                userId, userId, schoolId, merchantId, userId);
    }

    @Transactional
    public void like(Long schoolId, Long userId, Long merchantId, Long reviewId, boolean liked) {
        requirePublishedMerchant(schoolId, merchantId);
        var owners = jdbc.query("SELECT user_id FROM campus_merchant_reviews WHERE id=? AND merchant_id=? "
                        + "AND school_id=? AND status='PUBLISHED' FOR UPDATE",
                (rs, n) -> rs.getLong("user_id"), reviewId, merchantId, schoolId);
        if (owners.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "短评不存在或未公开");
        if (owners.get(0).equals(userId)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "不能为自己的短评点赞");
        if (liked) jdbc.update("INSERT INTO campus_review_likes(review_id,user_id) VALUES (?,?) "
                + "ON DUPLICATE KEY UPDATE user_id=VALUES(user_id)", reviewId, userId);
        else jdbc.update("DELETE FROM campus_review_likes WHERE review_id=? AND user_id=?", reviewId, userId);
    }

    @Transactional
    public void report(Long schoolId, Long userId, Long merchantId, Long reviewId, String reason) {
        if (!List.of("隐私泄露", "辱骂攻击", "广告诈骗", "内容不实", "其他问题").contains(reason))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"请选择举报原因");
        requirePublishedMerchant(schoolId,merchantId);
        var owners=jdbc.query("SELECT user_id FROM campus_merchant_reviews WHERE id=? AND merchant_id=? AND school_id=? AND status='PUBLISHED' FOR UPDATE",
                (rs,n)->rs.getLong(1),reviewId,merchantId,schoolId);
        if(owners.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND,"评价不存在或未公开");
        if(owners.get(0).equals(userId)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"自己的评价可以直接修改或清空");
        String subject="商家评价举报#"+reviewId;
        Integer existing=jdbc.queryForObject("SELECT COUNT(*) FROM contact_messages WHERE school_id=? AND user_id=? AND subject=? AND status='NEW'",Integer.class,schoolId,userId,subject);
        if(existing==null || existing==0) jdbc.update("INSERT INTO contact_messages(user_id,school_id,name,contact,subject,message) VALUES(?,?,'评价举报','',?,?)",
                userId,schoolId,subject,"商家#"+merchantId+" · 评价#"+reviewId+"\n举报原因："+reason+"\n可在食堂与商家的用户评价中处理，不自动下架。");
    }

    static String normalizeComment(String comment) {
        if (comment == null) return null;
        String text = comment.replaceAll("[\\p{Cf}]", "").replaceAll("\\s+", " ").trim();
        if (text.length() > 500) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "短评不能超过500字");
        if (text.matches("(?s).*\\p{Cc}.*")) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "短评含不支持的控制字符");
        if (java.util.regex.Pattern.compile("(?<!\\d)1[3-9]\\d{9}(?!\\d)|[\\w.+-]+@[\\w.-]+\\.[A-Za-z]{2,}|(?<!\\d)\\d{17}[\\dXx](?!\\d)")
                .matcher(Normalizer.normalize(text, Normalizer.Form.NFKC)).find()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "请移除手机号、邮箱或身份证号后再提交短评");
        }
        com.campusai.community.CommunityTextPolicy.check(text);
        return text;
    }

    public List<AdminReview> adminReviews(Long schoolId) {
        return jdbc.query("SELECT review.id, review.merchant_id, merchant.name AS merchant_name, "
                + "rating.score, review.comment_text, review.status, review.updated_at, "
                + "(SELECT COUNT(*) FROM contact_messages report WHERE report.school_id=review.school_id AND report.subject=CONCAT('商家评价举报#',review.id) AND report.status='NEW') AS report_count "
                + "FROM campus_merchant_reviews review "
                + "JOIN campus_canteen_merchants merchant ON merchant.id = review.merchant_id "
                + "AND merchant.school_id = review.school_id "
                + "JOIN campus_merchant_ratings rating ON rating.merchant_id = review.merchant_id "
                + "AND rating.user_id = review.user_id "
                + "WHERE review.school_id = ? ORDER BY "
                + "CASE WHEN EXISTS(SELECT 1 FROM contact_messages report WHERE report.school_id=review.school_id AND report.subject=CONCAT('商家评价举报#',review.id) AND report.status='NEW') THEN 0 WHEN review.status = 'PENDING' THEN 1 ELSE 2 END, review.updated_at DESC LIMIT 100",
                (rs, rowNum) -> new AdminReview(rs.getLong("id"), rs.getLong("merchant_id"),
                        rs.getString("merchant_name"), rs.getInt("score"), rs.getString("comment_text"),
                        rs.getString("status"), rs.getTimestamp("updated_at").toLocalDateTime(), rs.getLong("report_count")), schoolId);
    }

    @Transactional
    public void reviewStatus(Long schoolId, Long reviewId, String status, String expectedComment) {
        var current = jdbc.query("SELECT comment_text FROM campus_merchant_reviews WHERE id=? AND school_id=? FOR UPDATE",
                (rs, n) -> rs.getString("comment_text"), reviewId, schoolId);
        if (current.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "短评不存在");
        if (!current.get(0).equals(expectedComment)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "短评内容已变更，请刷新并重新审核");
        }
        if ("PUBLISHED".equals(status)) com.campusai.community.CommunityTextPolicy.check(current.get(0));
        reviewStatus(schoolId, reviewId, status);
        jdbc.update("UPDATE contact_messages SET status='HANDLED' WHERE school_id=? AND subject=? AND status='NEW'",
                schoolId,"商家评价举报#"+reviewId);
    }

    void reviewStatus(Long schoolId, Long reviewId, String status) {
        if (!List.of("PUBLISHED", "HIDDEN").contains(status)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "审核状态不正确");
        }
        int updated = jdbc.update("UPDATE campus_merchant_reviews SET status = ? "
                + "WHERE id = ? AND school_id = ?", status, reviewId, schoolId);
        if (updated == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "短评不存在");
    }

    public void requirePublishedMerchant(Long schoolId, Long merchantId) {
        Long visible = jdbc.queryForObject("SELECT COUNT(*) FROM campus_canteen_merchants m "
                + "JOIN campus_canteens c ON c.id = m.canteen_id AND c.school_id = m.school_id "
                + "WHERE m.id = ? AND m.school_id = ? AND m.status = 'PUBLISHED' "
                + "AND c.status = 'PUBLISHED'", Long.class, merchantId, schoolId);
        if (visible == null || visible == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "本校商家不存在或尚未发布");
        }
    }

    public void requireAdminMerchant(Long schoolId, Long merchantId) {
        requireMerchant(schoolId, merchantId);
    }

    public List<Canteen> adminCanteens(Long schoolId) {
        return jdbc.query("SELECT id, name, status FROM campus_canteens WHERE school_id = ? ORDER BY id",
                CANTEEN_ROW, schoolId);
    }

    public List<Merchant> adminMerchants(Long schoolId) {
        return jdbc.query("SELECT id, canteen_id, name, location, description, status, "
                + "operating_status FROM campus_canteen_merchants WHERE school_id = ? "
                + "ORDER BY canteen_id, id", MERCHANT_ROW, schoolId);
    }

    @Transactional
    public Canteen saveCanteen(Long schoolId, Long id, CanteenInput input) {
        String name = input.name().trim();
        try {
            if (id == null) {
                GeneratedKeyHolder keys = new GeneratedKeyHolder();
                jdbc.update(connection -> {
                    var statement = connection.prepareStatement(
                            "INSERT INTO campus_canteens (school_id, name) VALUES (?, ?)",
                            Statement.RETURN_GENERATED_KEYS);
                    statement.setLong(1, schoolId);
                    statement.setString(2, name);
                    return statement;
                }, keys);
                id = keys.getKey().longValue();
            } else {
                int updated = jdbc.update("UPDATE campus_canteens SET name = ?, status = 'DRAFT' "
                        + "WHERE id = ? AND school_id = ?", name, id, schoolId);
                if (updated == 0) throw missingCanteen();
            }
        } catch (DuplicateKeyException exception) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "本校已有同名食堂");
        }
        return requireCanteen(schoolId, id);
    }

    @Transactional
    public Merchant saveMerchant(Long schoolId, Long id, MerchantInput input) {
        requireCanteen(schoolId, input.canteenId());
        String name = input.name().trim();
        try {
            if (id == null) {
                GeneratedKeyHolder keys = new GeneratedKeyHolder();
                jdbc.update(connection -> {
                    var statement = connection.prepareStatement(
                            "INSERT INTO campus_canteen_merchants "
                                    + "(school_id, canteen_id, name, location, description) "
                                    + "VALUES (?, ?, ?, ?, ?)", Statement.RETURN_GENERATED_KEYS);
                    statement.setLong(1, schoolId);
                    statement.setLong(2, input.canteenId());
                    statement.setString(3, name);
                    statement.setString(4, clean(input.location()));
                    statement.setString(5, clean(input.description()));
                    return statement;
                }, keys);
                id = keys.getKey().longValue();
            } else {
                int updated = jdbc.update("UPDATE campus_canteen_merchants SET canteen_id = ?, "
                        + "name = ?, location = ?, description = ?, status = 'DRAFT' "
                        + "WHERE id = ? AND school_id = ?", input.canteenId(), name,
                        clean(input.location()), clean(input.description()), id, schoolId);
                if (updated == 0) throw missingMerchant();
            }
        } catch (DuplicateKeyException exception) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "该食堂已有同名商家");
        }
        return requireMerchant(schoolId, id);
    }

    public Canteen setCanteenPublished(Long schoolId, Long id, boolean published) {
        if (jdbc.update("UPDATE campus_canteens SET status = ? WHERE id = ? AND school_id = ?",
                published ? "PUBLISHED" : "ARCHIVED", id, schoolId) == 0) throw missingCanteen();
        return requireCanteen(schoolId, id);
    }

    public Merchant setMerchantPublished(Long schoolId, Long id, boolean published) {
        Merchant merchant = requireMerchant(schoolId, id);
        if (published && !"PUBLISHED".equals(requireCanteen(schoolId, merchant.canteenId()).status())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "请先发布所属食堂");
        }
        jdbc.update("UPDATE campus_canteen_merchants SET status = ? WHERE id = ? AND school_id = ?",
                published ? "PUBLISHED" : "ARCHIVED", id, schoolId);
        return requireMerchant(schoolId, id);
    }

    public Merchant setOperatingStatus(Long schoolId, Long id, String status) {
        if (!List.of("OPEN", "CLOSED", "UNKNOWN").contains(status)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "营业状态不正确");
        }
        if (jdbc.update("UPDATE campus_canteen_merchants SET operating_status = ? "
                + "WHERE id = ? AND school_id = ?", status, id, schoolId) == 0) throw missingMerchant();
        return requireMerchant(schoolId, id);
    }

    private Canteen requireCanteen(Long schoolId, Long id) {
        return jdbc.query("SELECT id, name, status FROM campus_canteens WHERE school_id = ? AND id = ?",
                CANTEEN_ROW, schoolId, id).stream().findFirst().orElseThrow(CanteenService::missingCanteen);
    }

    private Merchant requireMerchant(Long schoolId, Long id) {
        return jdbc.query("SELECT id, canteen_id, name, location, description, status, "
                + "operating_status FROM campus_canteen_merchants WHERE school_id = ? AND id = ?",
                MERCHANT_ROW, schoolId, id).stream().findFirst().orElseThrow(CanteenService::missingMerchant);
    }

    private static ResponseStatusException missingCanteen() {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, "本校食堂不存在");
    }

    private static ResponseStatusException missingMerchant() {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, "本校商家不存在");
    }

    private static String clean(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
