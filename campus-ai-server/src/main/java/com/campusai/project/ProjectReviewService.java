package com.campusai.project;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;

@Service
public class ProjectReviewService {
    private final JdbcTemplate jdbc;
    private final ProjectService projects;
    private final ObjectMapper json;
    public ProjectReviewService(JdbcTemplate jdbc, ProjectService projects, ObjectMapper json) { this.jdbc=jdbc; this.projects=projects; this.json=json; }
    public record Entry(String id, String title, int revision, String owner, String recipient, boolean includesMaterial, boolean includesData, String reviewNote, LocalDateTime expiresAt, boolean revoked, boolean expired) {}
    public record Detail(Entry entry, ProjectContent content, boolean canReview, int noteConcurrencyVersion) {}
    private static final String SELECT = "SELECT r.*,o.username AS owner_name,v.username AS recipient_name FROM project_reviews r JOIN users o ON o.id=r.owner_id JOIN users v ON v.id=r.recipient_id ";
    private Entry entry(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new Entry(rs.getString("id"),rs.getString("title"),rs.getInt("revision"),rs.getString("owner_name"),rs.getString("recipient_name"),rs.getBoolean("includes_material"),rs.getBoolean("includes_data"),rs.getString("review_note"),rs.getTimestamp("expires_at").toLocalDateTime(),rs.getTimestamp("revoked_at")!=null,rs.getBoolean("expired"));
    }
    public List<Entry> outgoing(Long owner, String projectId) {
        projects.get(owner,projectId);
        return jdbc.query(SELECT.replace("r.*", "r.*, (r.expires_at <= CURRENT_TIMESTAMP) AS expired") + "WHERE r.owner_id=? AND r.project_id=? ORDER BY r.created_at DESC LIMIT 50",(rs,n)->entry(rs),owner,projectId);
    }
    public List<Entry> incoming(Long recipient) {
        return jdbc.query(SELECT.replace("r.*", "r.*, FALSE AS expired") + "WHERE r.recipient_id=? AND r.revoked_at IS NULL AND r.expires_at>CURRENT_TIMESTAMP AND o.status=1 ORDER BY r.created_at DESC LIMIT 50",(rs,n)->entry(rs),recipient);
    }
    @Transactional
    public Entry create(Long owner, String projectId, String requestId, int revision, String recipientName, boolean material, boolean data) {
        try { UUID.fromString(requestId); } catch (RuntimeException e) { throw bad("请求标识无效"); }
        projects.get(owner,projectId);
        jdbc.queryForObject("SELECT id FROM users WHERE id=? FOR UPDATE",Long.class,owner);
        var recipients=jdbc.queryForList("SELECT v.id FROM users v JOIN users o ON o.id=? WHERE v.username=? AND v.status=1 AND v.school_id=o.school_id AND v.id<>o.id",Long.class,owner,recipientName.trim());
        if (recipients.isEmpty()) throw bad("无法发起审阅，请核对对方已注册的同校账号，不能邀请自己");
        Long recipient=recipients.get(0);
        var existing=jdbc.queryForList("SELECT id FROM project_reviews WHERE id=? AND owner_id=? AND project_id=? AND recipient_id=? AND revision=? AND includes_material=? AND includes_data=?",String.class,requestId,owner,projectId,recipient,revision,material,data);
        if (!existing.isEmpty()) return outgoing(owner,projectId).stream().filter(r->r.id().equals(requestId)).findFirst().orElseThrow(()->bad("审阅记录已过期，请刷新"));
        if (!jdbc.queryForList("SELECT id FROM project_reviews WHERE id=?",String.class,requestId).isEmpty()) throw new ResponseStatusException(HttpStatus.CONFLICT,"请求已被使用，请刷新审阅列表再试");
        Integer count=jdbc.queryForObject("SELECT COUNT(*) FROM project_reviews WHERE owner_id=?",Integer.class,owner);
        if (count!=null && count>=50) throw bad("最多保留50条审阅记录，请先清理不再需要的项目；记录随项目删除");
        ProjectContent source=projects.version(owner,projectId,revision);
        // Never include owner's private preparation notes, feedback judgments or unselected materials.
        var requirements=source.requirements().stream().map(r->new ProjectContent.Requirement(r.id(),r.title(),r.sourceLine(),r.sourceQuote(),r.confirmed(),r.done(),material?r.evidence():"", "")).toList();
        var snapshot=new ProjectContent(source.title(),source.track(),source.deadline(),source.brief(),material?source.manuscript():"",requirements,data?source.dataSheet():null);
        LocalDateTime now=jdbc.queryForObject("SELECT CURRENT_TIMESTAMP",java.sql.Timestamp.class).toLocalDateTime();
        jdbc.update("INSERT INTO project_reviews(id,project_id,owner_id,recipient_id,revision,includes_material,includes_data,title,snapshot_json,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?)",requestId,projectId,owner,recipient,revision,material,data,source.title(),json.writeValueAsString(snapshot),now.plusDays(7));
        return outgoing(owner,projectId).stream().filter(r->r.id().equals(requestId)).findFirst().orElseThrow();
    }
    public Detail get(Long viewer,String id) {
        var rows=jdbc.query(SELECT.replace("r.*", "r.*, FALSE AS expired")+"WHERE r.id=? AND (r.owner_id=? OR r.recipient_id=?) AND r.revoked_at IS NULL AND r.expires_at>CURRENT_TIMESTAMP AND o.status=1 AND v.status=1",(rs,n)->new Detail(entry(rs),json.readValue(rs.getString("snapshot_json"),ProjectContent.class),rs.getLong("recipient_id")==viewer,1),id,viewer,viewer);
        if (rows.isEmpty()) throw missing();
        return rows.get(0);
    }
    @Transactional
    public void review(Long reviewer,String id,String note,String baseNote) {
        if (note==null || note.isBlank() || note.length()>2000) throw bad("审阅意见需为1–2000字");
        if (baseNote==null || baseNote.length()>2000) throw bad("请重新载入当前审阅意见后再发送");
        get(reviewer,id);
        var notes=jdbc.queryForList("SELECT review_note FROM project_reviews WHERE id=? AND recipient_id=? AND revoked_at IS NULL AND expires_at>CURRENT_TIMESTAMP FOR UPDATE",String.class,id,reviewer);
        if (notes.isEmpty()) throw missing();
        String current=notes.get(0);
        // Identical network retries succeed; different stale edits never overwrite a newer note.
        if (current.equals(note.trim())) return;
        if (!current.equals(baseNote)) throw new ResponseStatusException(HttpStatus.CONFLICT,"审阅意见已在其他页面更新。当前草稿未发送，请核对最新意见后再编辑");
        int changed=jdbc.update("UPDATE project_reviews SET review_note=?,reviewed_at=CURRENT_TIMESTAMP WHERE id=? AND recipient_id=? AND revoked_at IS NULL AND expires_at>CURRENT_TIMESTAMP",note.trim(),id,reviewer);
        if (changed!=1) throw missing();
    }
    public void revoke(Long owner,String projectId,String id) {
        projects.get(owner,projectId);
        // Revocation also clears stored material and notes, not merely hides a link.
        if (jdbc.update("UPDATE project_reviews SET revoked_at=CURRENT_TIMESTAMP,snapshot_json='{}',review_note='' WHERE id=? AND project_id=? AND owner_id=?",id,projectId,owner)!=1) throw missing();
    }
    private ResponseStatusException bad(String message) { return new ResponseStatusException(HttpStatus.BAD_REQUEST,message); }
    private ResponseStatusException missing() { return new ResponseStatusException(HttpStatus.NOT_FOUND,"审阅不存在、已到期、已撤销或你没有访问权限"); }
}
