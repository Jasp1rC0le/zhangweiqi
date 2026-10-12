package com.campusai.project;

import tools.jackson.databind.ObjectMapper;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.List;
import java.util.UUID;

@Service
public class ProjectService {
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    public ProjectService(JdbcTemplate jdbc, ObjectMapper json) { this.jdbc = jdbc; this.json = json; }
    public record Summary(String id, String title, String track, int revision, boolean archived, LocalDateTime updatedAt) {}
    public record Project(String id, int revision, boolean archived, LocalDateTime updatedAt, ProjectContent content) {}
    public record Version(int revision, LocalDateTime createdAt) {}

    public List<Summary> list(Long userId) {
        return jdbc.query("SELECT id,title,track,revision,archived,updated_at FROM student_projects WHERE user_id=? ORDER BY updated_at DESC,id",
                (rs, n) -> new Summary(rs.getString("id"), rs.getString("title"), rs.getString("track"), rs.getInt("revision"), rs.getBoolean("archived"), rs.getTimestamp("updated_at").toLocalDateTime()), userId);
    }
    public Project get(Long userId, String id) {
        var rows = jdbc.query("SELECT id,revision,archived,updated_at,content_json FROM student_projects WHERE id=? AND user_id=?",
                (rs, n) -> new Project(rs.getString("id"), rs.getInt("revision"), rs.getBoolean("archived"), rs.getTimestamp("updated_at").toLocalDateTime(), json.readValue(rs.getString("content_json"), ProjectContent.class)), id, userId);
        if (rows.isEmpty()) throw missing();
        return rows.get(0);
    }
    @Transactional
    public Project create(Long userId, String id, ProjectContent content) {
        try { UUID.fromString(id); } catch (RuntimeException e) { throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "项目标识无效"); }
        String encoded = encode(content);
        // Serialize per-account create requests, including retries and capacity checks.
        jdbc.queryForObject("SELECT id FROM users WHERE id=? FOR UPDATE", Long.class, userId);
        if (!jdbc.queryForList("SELECT id FROM student_projects WHERE id=? AND user_id=?", String.class, id, userId).isEmpty()) {
            Project existing = get(userId, id);
            if (!json.writeValueAsString(existing.content()).equals(encoded))
                throw new ResponseStatusException(HttpStatus.CONFLICT, "项目已创建，但本页内容随后发生变化。请导出当前草稿，再从项目目录打开已保存版本");
            return existing;
        }
        Long count = jdbc.queryForObject("SELECT COUNT(*) FROM student_projects WHERE user_id=?", Long.class, userId);
        if (count != null && count >= 50) throw new ResponseStatusException(HttpStatus.CONFLICT, "当前最多保存50个项目，请先导出并删除不再需要的项目");
        if (!jdbc.queryForList("SELECT id FROM student_projects WHERE id=?", String.class, id).isEmpty()) throw new ResponseStatusException(HttpStatus.CONFLICT, "项目标识冲突，请重新创建");
        jdbc.update("INSERT INTO student_projects(id,user_id,title,track,revision,archived,content_json) VALUES(?,?,?,?,1,FALSE,?)", id, userId, content.title().trim(), content.track(), encoded);
        jdbc.update("INSERT INTO student_project_versions(project_id,revision,content_json) VALUES(?,1,?)", id, encoded);
        return get(userId, id);
    }
    @Transactional
    public Project save(Long userId, String id, int revision, ProjectContent content, boolean archived) {
        String encoded = encode(content);
        get(userId, id);
        int changed = jdbc.update("UPDATE student_projects SET title=?,track=?,content_json=?,archived=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=? AND revision=?",
                content.title().trim(), content.track(), encoded, archived, id, userId, revision);
        if (changed != 1) throw new ResponseStatusException(HttpStatus.CONFLICT, "项目已在另一页面更新。请先导出当前草稿，再重新加载项目");
        jdbc.update("INSERT INTO student_project_versions(project_id,revision,content_json) VALUES(?,?,?)", id, revision + 1, encoded);
        jdbc.update("DELETE FROM student_project_versions WHERE project_id=? AND revision<=?", id, revision + 1 - 50);
        return get(userId, id);
    }
    public List<Version> versions(Long userId, String id) {
        get(userId, id);
        return jdbc.query("SELECT revision,created_at FROM student_project_versions WHERE project_id=? ORDER BY revision DESC",
                (rs, n) -> new Version(rs.getInt("revision"), rs.getTimestamp("created_at").toLocalDateTime()), id);
    }
    public ProjectContent version(Long userId, String id, int revision) {
        get(userId, id);
        var rows = jdbc.query("SELECT content_json FROM student_project_versions WHERE project_id=? AND revision=?",
                (rs, n) -> json.readValue(rs.getString("content_json"), ProjectContent.class), id, revision);
        if (rows.isEmpty()) throw missing();
        return rows.get(0);
    }
    @Transactional
    public void delete(Long userId, String id, int revision) {
        get(userId, id);
        if (jdbc.update("DELETE FROM student_projects WHERE id=? AND user_id=? AND revision=?", id, userId, revision) != 1)
            throw new ResponseStatusException(HttpStatus.CONFLICT, "项目已更新，请重新加载后再删除");
    }
    private String encode(ProjectContent content) {
        if (content.reviewFeedback() != null && new HashSet<>(content.reviewFeedback().stream().map(ProjectContent.ReviewFeedback::issueKey).toList()).size() != content.reviewFeedback().size())
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "复核记录标识不能重复");
        if (content.requirements().stream().map(ProjectContent.Requirement::id).anyMatch(id -> id == null || id.isBlank())
                || new HashSet<>(content.requirements().stream().map(ProjectContent.Requirement::id).toList()).size() != content.requirements().size())
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "要求标识不能重复或为空");
        String encoded = json.writeValueAsString(content);
        if (encoded.length() > 150000) throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "项目文本过大，请精简后保存");
        return encoded;
    }
    private ResponseStatusException missing() { return new ResponseStatusException(HttpStatus.NOT_FOUND, "项目或版本不存在"); }
}
