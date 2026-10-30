package com.campusai.wall;

import jakarta.validation.constraints.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.text.Normalizer;
import java.time.LocalDateTime;
import java.util.*;
import java.util.regex.Pattern;

/** School-scoped discussion with local pre-publication checks and post-publication reports. Never a public knowledge source by default. */
@Service
public class WallService {
    public record Input(@NotBlank @Size(max=36) String id,
            @NotBlank @jakarta.validation.constraints.Pattern(regexp="course|experiment|campus|team") String category,
            @NotBlank @Size(max=100) String title, @NotBlank @Size(max=5000) String body) {}
    public record CommentInput(@NotBlank @Size(max=36) String id, @NotBlank @Size(max=2000) String body) {}
    public record ReviewInput(@Min(1) int revision,
            @NotBlank @jakarta.validation.constraints.Pattern(regexp="PUBLISHED|REJECTED|HIDDEN") String status,
            @NotNull @Size(max=300) String note) {}
    public record Entry(String id, String parentId, String category, String title, String body,
            String status, int revision, boolean mine, int likes, boolean liked, int replies,
            String reviewNote, LocalDateTime createdAt) {}
    public record Page(List<Entry> items, boolean more, int nextOffset) {}
    public record Report(String entryId, String reason, int count) {}
    private final JdbcTemplate jdbc;
    private static final Set<String> CATEGORIES=Set.of("course","experiment","campus","team");
    private static final Set<String> REASONS=Set.of("隐私泄露","辱骂攻击","广告诈骗","内容不实","其他问题");
    private static final Pattern PRIVATE_DATA=Pattern.compile("(?<!\\d)1[3-9]\\d{9}(?!\\d)|[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}|(?<!\\d)\\d{17}[\\dX](?!\\d)", Pattern.CASE_INSENSITIVE);
    public WallService(JdbcTemplate jdbc) { this.jdbc=jdbc; }
    private ResponseStatusException missing() { return new ResponseStatusException(HttpStatus.NOT_FOUND,"内容不存在或不可访问"); }
    private static void bad(String message) { throw new ResponseStatusException(HttpStatus.BAD_REQUEST,message); }
    private String text(String value,int max) {
        if(value==null || value.isBlank() || value.length()>max) { bad("内容不能为空或超过长度限制"); }
        String probe=Normalizer.normalize(value,Normalizer.Form.NFKC).replaceAll("[\\p{Z}\\s\\p{Cf}]","");
        if(PRIVATE_DATA.matcher(probe).find()) bad("请移除手机号、邮箱或证件号；不要发布他人的个人信息");
        com.campusai.community.CommunityTextPolicy.check(value);
        return value.strip();
    }
    private void uuid(String value) { try { if(!UUID.fromString(value).toString().equals(value)) bad("请求编号无效"); } catch(IllegalArgumentException|NullPointerException e) { bad("请求编号无效"); } }
    private String select(Long viewer) {
        // Viewer is a server-authenticated Long, not an interpolated request string.
        return "SELECT e.*, (SELECT COUNT(*) FROM campus_wall_likes l WHERE l.entry_id=e.id) likes, "
                + "(SELECT COUNT(*) FROM campus_wall_likes l WHERE l.entry_id=e.id AND l.user_id="+viewer+") liked, "
                + "(SELECT COUNT(*) FROM campus_wall_entries c WHERE c.parent_id=e.id AND c.status='PUBLISHED') replies FROM campus_wall_entries e ";
    }
    private RowMapper<Entry> mapper(Long viewer,boolean admin) { return (rs,n)->new Entry(rs.getString("id"),rs.getString("parent_id"),rs.getString("category"),rs.getString("title"),rs.getString("body"),rs.getString("status"),rs.getInt("revision"),rs.getLong("user_id")==viewer,rs.getInt("likes"),rs.getInt("liked")>0,rs.getInt("replies"),(admin||rs.getLong("user_id")==viewer)?rs.getString("review_note"):"",rs.getTimestamp("created_at").toLocalDateTime()); }
    public Page list(Long school,Long user,String category,boolean mine,int offset) {
        if(offset<0 || offset>10000) bad("页码超出范围，请缩小筛选范围");
        if(category!=null && !category.isBlank() && !CATEGORIES.contains(category)) bad("未知话题");
        List<Object> args=new ArrayList<>(); args.add(school);
        String where="WHERE e.school_id=? AND e.parent_id IS NULL ";
        if(mine) { where+="AND e.user_id=? "; args.add(user); } else where+="AND e.status='PUBLISHED' ";
        if(category!=null&&!category.isBlank()) { where+="AND e.category=? "; args.add(category); }
        args.add(offset);
        List<Entry> rows=jdbc.query(select(user)+where+"ORDER BY e.created_at DESC,e.id DESC LIMIT 31 OFFSET ?",mapper(user,false),args.toArray());
        return new Page(rows.stream().limit(30).toList(),rows.size()>30,offset+30);
    }
    private Map<String,Object> lock(Long school,String id) {
        var rows=jdbc.queryForList("SELECT id,user_id,parent_id,status FROM campus_wall_entries WHERE school_id=? AND id=? FOR UPDATE",school,id);
        if(rows.isEmpty()) throw missing(); return rows.get(0);
    }
    public Entry moderationContext(Long school,Long admin,String id) {
        var rows=jdbc.query(select(admin)+"WHERE e.school_id=? AND e.id=?",mapper(admin,true),school,id);
        if(rows.isEmpty()) throw missing(); return rows.get(0);
    }
    public Entry get(Long school,Long user,String id) {
        var rows=jdbc.query(select(user)+"WHERE e.school_id=? AND e.id=? AND (e.status='PUBLISHED' OR e.user_id=?) AND (e.parent_id IS NULL OR EXISTS(SELECT 1 FROM campus_wall_entries p WHERE p.id=e.parent_id AND p.status='PUBLISHED'))",mapper(user,false),school,id,user);
        if(rows.isEmpty()) throw missing(); return rows.get(0);
    }
    @Transactional public Entry create(Long school,Long user,Input input) {
        uuid(input.id());
        if(!CATEGORIES.contains(input.category())) bad("未知话题");
        String title=text(input.title(),100), body=text(input.body(),5000);
        // Serialize each author's idempotent submissions without leaking other authors' UUIDs.
        jdbc.queryForObject("SELECT id FROM users WHERE id=? FOR UPDATE",Long.class,user);
        var existing=jdbc.queryForList("SELECT user_id,parent_id,title,body,category FROM campus_wall_entries WHERE id=?",input.id());
        if(!existing.isEmpty()) {
            var row=existing.get(0);
            if(((Number)row.get("user_id")).longValue()!=user || row.get("parent_id")!=null || !title.equals(row.get("title")) || !body.equals(row.get("body")) || !input.category().equals(row.get("category"))) throw new ResponseStatusException(HttpStatus.CONFLICT,"提交编号已使用，请刷新后重试");
            return get(school,user,input.id());
        }
        jdbc.update("INSERT INTO campus_wall_entries(id,school_id,user_id,category,title,body,status) VALUES(?,?,?,?,?,?,'PUBLISHED')",input.id(),school,user,input.category(),title,body);
        return get(school,user,input.id());
    }
    public Page comments(Long school,Long user,String id,int offset) {
        Entry parent=get(school,user,id);
        if(parent.parentId()!=null) throw missing();
        if(offset<0||offset>10000) bad("页码超出范围");
        var rows=jdbc.query(select(user)+"WHERE e.school_id=? AND e.parent_id=? AND (e.status='PUBLISHED' OR e.user_id=?) ORDER BY e.created_at,e.id LIMIT 31 OFFSET ?",mapper(user,false),school,id,user,offset);
        return new Page(rows.stream().limit(30).toList(),rows.size()>30,offset+30);
    }
    @Transactional public Entry comment(Long school,Long user,String parent,CommentInput input) {
        uuid(input.id()); String body=text(input.body(),2000);
        var row=lock(school,parent);
        if(!"PUBLISHED".equals(row.get("status"))||row.get("parent_id")!=null) throw missing();
        var existing=jdbc.queryForList("SELECT user_id,parent_id,body FROM campus_wall_entries WHERE id=?",input.id());
        if(!existing.isEmpty()) {
            var old=existing.get(0);
            if(((Number)old.get("user_id")).longValue()!=user || !parent.equals(old.get("parent_id")) || !body.equals(old.get("body"))) throw new ResponseStatusException(HttpStatus.CONFLICT,"提交编号已使用");
            return get(school,user,input.id());
        }
        jdbc.update("INSERT INTO campus_wall_entries(id,school_id,user_id,parent_id,category,title,body,status) VALUES(?,?,?,?,'campus','回复',?,'PUBLISHED')",input.id(),school,user,parent,body);
        return get(school,user,input.id());
    }
    @Transactional public void like(Long school,Long user,String id,boolean liked) {
        var row=lock(school,id);
        get(school,user,id); // Checks hidden parents as well.
        if(!"PUBLISHED".equals(row.get("status"))) throw missing();
        if(((Number)row.get("user_id")).longValue()==user) bad("不能给自己的内容点赞");
        if(liked) {
            if(jdbc.queryForObject("SELECT COUNT(*) FROM campus_wall_likes WHERE entry_id=? AND user_id=?",Integer.class,id,user)==0) jdbc.update("INSERT INTO campus_wall_likes(entry_id,user_id) VALUES(?,?)",id,user);
        } else jdbc.update("DELETE FROM campus_wall_likes WHERE entry_id=? AND user_id=?",id,user);
    }
    @Transactional public void remove(Long school,Long user,String id) {
        var row=lock(school,id);
        if(((Number)row.get("user_id")).longValue()!=user) throw missing();
        jdbc.update("DELETE FROM campus_wall_entries WHERE id=? AND user_id=?",id,user);
    }
    @Transactional public void report(Long school,Long user,String id,String reason) {
        if(!REASONS.contains(reason)) bad("请选择举报原因");
        var row=lock(school,id); get(school,user,id);
        if(!"PUBLISHED".equals(row.get("status"))) throw missing();
        if(jdbc.queryForObject("SELECT COUNT(*) FROM campus_wall_reports WHERE entry_id=? AND user_id=?",Integer.class,id,user)==0) jdbc.update("INSERT INTO campus_wall_reports(entry_id,user_id,reason) VALUES(?,?,?)",id,user,reason);
    }
    public List<Entry> queue(Long school,Long admin) {
        return jdbc.query(select(admin)+"WHERE e.school_id=? AND (e.status='PENDING' OR EXISTS(SELECT 1 FROM campus_wall_reports r WHERE r.entry_id=e.id AND r.resolved=FALSE)) ORDER BY e.created_at,e.id LIMIT 100",mapper(admin,true),school);
    }
    public List<Report> reports(Long school) {
        return jdbc.query("SELECT r.entry_id,r.reason,COUNT(*) total FROM campus_wall_reports r JOIN campus_wall_entries e ON e.id=r.entry_id WHERE e.school_id=? AND r.resolved=FALSE GROUP BY r.entry_id,r.reason LIMIT 300",(rs,n)->new Report(rs.getString(1),rs.getString(2),rs.getInt(3)),school);
    }
    @Transactional public void review(Long school,Long admin,String id,ReviewInput input) {
        if(!Set.of("PUBLISHED","REJECTED","HIDDEN").contains(input.status())) bad("审核状态无效");
        if(input.note()==null||input.note().length()>300) bad("审核说明过长");
        var row=lock(school,id);
        if("PUBLISHED".equals(input.status())) {
            Entry content=moderationContext(school,admin,id);
            com.campusai.community.CommunityTextPolicy.check(content.title());
            com.campusai.community.CommunityTextPolicy.check(content.body());
        }
        if("PUBLISHED".equals(input.status())&&row.get("parent_id")!=null) {
            var p=lock(school,(String)row.get("parent_id"));
            if(!"PUBLISHED".equals(p.get("status"))) throw new ResponseStatusException(HttpStatus.CONFLICT,"主帖未公开，不能公开回复");
        }
        int count=jdbc.update("UPDATE campus_wall_entries SET status=?,review_note=?,reviewer_id=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND school_id=? AND revision=?",input.status(),input.note().strip(),admin,id,school,input.revision());
        if(count!=1) throw new ResponseStatusException(HttpStatus.CONFLICT,"内容状态已改变，请刷新审核队列");
        jdbc.update("UPDATE campus_wall_reports SET resolved=TRUE WHERE entry_id=?",id);
    }
}
