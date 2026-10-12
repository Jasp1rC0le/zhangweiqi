package com.campusai.career;

import com.campusai.search.WebSearchService;
import com.campusai.search.model.WebSearchResult;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;

@Service
public class EmployerDiscoveryService {
    private static final String BASE_QUERY = "天津中德应用技术大学 海河教育园区 雅深路2号 附近 企业 招聘 校企合作";

    private final JdbcTemplate jdbc;
    private final WebSearchService search;
    private final CareerService career;

    public EmployerDiscoveryService(JdbcTemplate jdbc, WebSearchService search, CareerService career) {
        this.jdbc = jdbc;
        this.search = search;
        this.career = career;
    }

    public List<EmployerCandidate> discover(Long schoolId, String keyword) {
        if (!search.isAvailable()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "国内搜索服务未配置");
        }
        String query = BASE_QUERY + (keyword == null || keyword.isBlank() ? "" : " " + keyword.trim());
        for (WebSearchResult result : search.search(query)) {
            saveCandidate(schoolId, query, result);
        }
        return list(schoolId, "PENDING");
    }

    public void seedOfficialCandidate(Long schoolId, String name, String sourceUrl,
                                      String summary, String publishedDate) {
        saveCandidate(schoolId, "天津中德应用技术大学官网校企合作资料",
                new WebSearchResult(name, sourceUrl, summary, publishedDate));
    }

    public List<EmployerCandidate> list(Long schoolId, String status) {
        String normalized = status == null || status.isBlank() ? "PENDING" : status.trim().toUpperCase(Locale.ROOT);
        if (!List.of("PENDING", "REJECTED", "IMPORTED").contains(normalized)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "候选状态无效");
        }
        return jdbc.query("SELECT * FROM campus_employer_candidates WHERE school_id = ? AND status = ? "
                        + "ORDER BY created_at DESC, id DESC LIMIT 200",
                (result, row) -> map(result), schoolId, normalized);
    }

    @Transactional
    public EmployerCandidate reject(Long schoolId, Long candidateId, Long reviewerId) {
        requirePending(schoolId, candidateId);
        jdbc.update("UPDATE campus_employer_candidates SET status = 'REJECTED', reviewed_by = ?, "
                + "reviewed_at = CURRENT_TIMESTAMP WHERE id = ? AND school_id = ? AND status = 'PENDING'",
                reviewerId, candidateId, schoolId);
        return require(schoolId, candidateId);
    }

    @Transactional
    public CampusEmployer importCandidate(Long schoolId, Long candidateId, Long reviewerId,
                                           CareerService.EmployerInput input) {
        requirePending(schoolId, candidateId);
        CampusEmployer employer = career.saveEmployer(schoolId, null, input);
        int updated = jdbc.update("UPDATE campus_employer_candidates SET status = 'IMPORTED', employer_id = ?, "
                        + "reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP "
                        + "WHERE id = ? AND school_id = ? AND status = 'PENDING'",
                employer.getId(), reviewerId, candidateId, schoolId);
        if (updated != 1) throw new ResponseStatusException(HttpStatus.CONFLICT, "企业线索已被处理");
        return employer;
    }

    private void saveCandidate(Long schoolId, String query, WebSearchResult result) {
        if (result == null || result.url() == null || result.url().isBlank()
                || result.title() == null || result.title().isBlank()) return;
        String domain = domain(result.url());
        jdbc.update("INSERT INTO campus_employer_candidates (school_id, discovery_query, candidate_name, "
                        + "source_url, source_hash, source_domain, source_summary, published_date, source_quality) "
                        + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE "
                        + "candidate_name = VALUES(candidate_name), source_summary = VALUES(source_summary), "
                        + "published_date = VALUES(published_date), source_quality = VALUES(source_quality)",
                schoolId, query, limit(result.title(), 300), limit(result.url(), 1000),
                sha256(result.url() + "|" + result.title()),
                domain, limit(result.content(), 5000), limit(result.publishedDate(), 80), quality(domain));
    }

    private EmployerCandidate requirePending(Long schoolId, Long id) {
        EmployerCandidate value = require(schoolId, id);
        if (!"PENDING".equals(value.status())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "企业线索已被处理");
        }
        return value;
    }

    private EmployerCandidate require(Long schoolId, Long id) {
        List<EmployerCandidate> rows = jdbc.query("SELECT * FROM campus_employer_candidates "
                        + "WHERE id = ? AND school_id = ?", (result, row) -> map(result), id, schoolId);
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "企业线索不存在");
        return rows.get(0);
    }

    private EmployerCandidate map(java.sql.ResultSet result) throws java.sql.SQLException {
        var reviewed = result.getTimestamp("reviewed_at");
        var created = result.getTimestamp("created_at");
        return new EmployerCandidate(result.getLong("id"), result.getLong("school_id"),
                result.getString("discovery_query"), result.getString("candidate_name"),
                result.getString("source_url"), result.getString("source_domain"),
                result.getString("source_summary"), result.getString("published_date"),
                result.getString("source_quality"), result.getString("status"),
                (Long) result.getObject("employer_id"), (Long) result.getObject("reviewed_by"),
                reviewed == null ? null : reviewed.toLocalDateTime(),
                created == null ? null : created.toLocalDateTime());
    }

    private String domain(String url) {
        try { return URI.create(url).getHost(); }
        catch (RuntimeException exception) { return null; }
    }

    private String quality(String domain) {
        if (domain == null) return "UNVERIFIED";
        String value = domain.toLowerCase(Locale.ROOT);
        if (value.endsWith(".gov.cn") || value.equals("tsguas.edu.cn")
                || value.endsWith(".tsguas.edu.cn")) return "OFFICIAL";
        return "UNVERIFIED";
    }

    private String sha256(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(value.trim().getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256不可用", exception);
        }
    }

    private String limit(String value, int max) {
        if (value == null) return null;
        String trimmed = value.trim();
        return trimmed.length() <= max ? trimmed : trimmed.substring(0, max);
    }
}
