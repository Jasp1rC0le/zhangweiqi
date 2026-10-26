package com.campusai.teaching;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.util.*;

/** Reviewed occupational identity, deliberately separate from platform roles and teaching scopes. */
@Service
public class TeachingIdentityService {
    public static final Set<String> STAFF = Set.of("TEACHER", "COUNSELOR", "SECRETARY");
    private final JdbcTemplate db;
    private final boolean enabled;
    private final Clock clock;
    @Autowired public TeachingIdentityService(JdbcTemplate db,
            @Value("${app.teaching.identity-enabled:false}") boolean enabled) {
        this(db, enabled, Clock.systemUTC());
    }
    public TeachingIdentityService(JdbcTemplate db, boolean enabled, Clock clock) {
        this.db=db; this.enabled=enabled; this.clock=clock;
    }
    public record Apply(String role, int revision) {}
    public record Review(int revision, String decision, String reason) {}
    public record Item(String id, long userId, String username, String nickname,
            String requestedRole, String status, int revision, String reason, Instant requestedAt, Instant reviewedAt) {}
    public record Mine(boolean enabled, List<Item> items) {}
    public record Page(List<Item> items, int page, int size, int total, int totalPages) {}
    private record Principal(long id, long school, String role) {}
    private static ResponseStatusException error(int code, String message) {
        return new ResponseStatusException(HttpStatus.valueOf(code), message);
    }
    public boolean enabled() { return enabled; }
    public String registrationRole(String role) {
        String value=role==null?"STUDENT":role;
        if(!"STUDENT".equals(value) && !STAFF.contains(value)) throw error(400,"请选择学生、教师、辅导员或书记；不能自行申请管理员");
        if(!"STUDENT".equals(value)) ready();
        return value;
    }
    private void ready() { if(!enabled) throw error(503,"教学身份申请尚未启用，请管理员完成审核配置；本次未提交"); }
    private Principal principal(long user, boolean lock) {
        var rows=db.query("SELECT id,school_id,role FROM users WHERE id=? AND status=1 AND school_id>0"+(lock?" FOR UPDATE":""),
                (r,n)->new Principal(r.getLong(1),r.getLong(2),r.getString(3)),user);
        if(rows.isEmpty()) throw error(403,"账号不可用");
        return rows.get(0);
    }
    private Principal admin(long user) {
        var p=principal(user,false);
        if(!"ADMIN".equals(p.role)) throw error(403,"需要本校管理员审核");
        return p;
    }
    private static final String SELECT="SELECT a.*,u.username,u.nickname FROM teaching_identities a JOIN users u ON u.id=a.user_id AND u.school_id=a.school_id ";
    private Item row(java.sql.ResultSet r) throws java.sql.SQLException {
        var reviewed=r.getTimestamp("reviewed_at");
        return new Item(r.getString("id"),r.getLong("user_id"),r.getString("username"),r.getString("nickname"),
                r.getString("requested_role"),r.getString("status"),r.getInt("revision"),r.getString("reason"),
                r.getTimestamp("requested_at").toInstant(),reviewed==null?null:reviewed.toInstant());
    }
    public Mine mine(long user) {
        var p=principal(user,false);
        return new Mine(enabled,enabled?db.query(SELECT+"WHERE a.user_id=? AND a.school_id=? ORDER BY a.requested_role",(r,n)->row(r),user,p.school):List.of());
    }
    @Transactional public Item apply(long user, Apply input) {
        ready();
        if(input==null || input.role==null || !STAFF.contains(input.role) || input.revision<0) throw error(400,"教学身份申请无效");
        // One lock order for submit/review prevents competing reapplications from creating two revisions.
        var p=principal(user,true);
        var rows=db.query(SELECT+"WHERE a.user_id=? AND a.requested_role=? AND a.school_id=?",(r,n)->row(r),user,input.role,p.school);
        var previous=rows.isEmpty()?null:rows.get(0);
        if(previous!=null && "PENDING".equals(previous.status) &&
                (input.revision==previous.revision || input.revision==previous.revision-1)) return previous;
        int revision=previous==null?0:previous.revision;
        if(revision!=input.revision) throw error(409,"申请已变化，请刷新身份状态再提交");
        if(previous!=null && ("APPROVED".equals(previous.status) || "REVOKED".equals(previous.status)))
            throw error(409,"此身份已审核或撤销；恢复须由管理员复核，不重复申请");
        String id=previous==null?UUID.randomUUID().toString():previous.id;
        if(previous==null) db.update("INSERT INTO teaching_identities(id,school_id,user_id,requested_role,status,revision,reason,requested_at) VALUES(?,?,?,?,?,?,?,?)",
                id,p.school,user,input.role,"PENDING",1,"",Timestamp.from(clock.instant()));
        else db.update("UPDATE teaching_identities SET status='PENDING',revision=revision+1,reason='',requested_at=?,reviewed_at=NULL WHERE id=? AND revision=?",
                Timestamp.from(clock.instant()),id,revision);
        audit(id,p.school,user,revision+1,previous==null?"NONE":previous.status,"PENDING","");
        return mine(user).items.stream().filter(i->i.id.equals(id)).findFirst().orElseThrow();
    }
    @Transactional(isolation=Isolation.REPEATABLE_READ,readOnly=true)
    public Page pending(long actor, String status, int page, int size, String search) {
        ready(); var p=admin(actor);
        if(page<0 || page>10000 || size<1 || size>100 || status==null ||
                !Set.of("PENDING","APPROVED","REJECTED","REVOKED","ALL").contains(status)) throw error(400,"审核分页参数无效");
        String text=search==null?"":search.trim(); if(text.length()>80) throw error(400,"搜索限80个字符");
        var args=new ArrayList<Object>(List.of(p.school));
        String where="WHERE a.school_id=? AND u.status=1 ";
        if(!"ALL".equals(status)) { where+="AND a.status=? "; args.add(status); }
        if(!text.isEmpty()) {
            where+="AND (u.username LIKE ? ESCAPE '!' OR u.nickname LIKE ? ESCAPE '!') ";
            String escaped="%"+text.replace("!","!!").replace("%","!%").replace("_","!_")+"%";args.add(escaped);args.add(escaped);
        }
        int total=db.queryForObject("SELECT COUNT(*) FROM teaching_identities a JOIN users u ON u.id=a.user_id AND u.school_id=a.school_id "+where,Integer.class,args.toArray());
        args.add(size); args.add(page*size);
        return new Page(db.query(SELECT+where+"ORDER BY a.requested_at DESC,a.id LIMIT ? OFFSET ?",(r,n)->row(r),args.toArray()),page,size,total,(total+size-1)/size);
    }
    @Transactional public Item review(long actor, String id, Review input) {
        ready();var p=admin(actor);
        if(id==null || !id.matches("[a-fA-F0-9-]{36}") || input==null || input.revision<1 ||
                !Set.of("APPROVE","REJECT","REVOKE","RESTORE").contains(input.decision==null?"":input.decision)) throw error(400,"身份审核参数无效");
        String reason=input.reason==null?"":input.reason.trim();
        if(reason.length()>200 || reason.chars().anyMatch(c->Character.isISOControl(c)) ||
                (!"APPROVE".equals(input.decision) && reason.isEmpty())) throw error(400,"拒绝、撤销或恢复需填写不超过200字的核验原因");
        var targets=db.queryForList("SELECT user_id FROM teaching_identities WHERE id=? AND school_id=? AND user_id IS NOT NULL",Long.class,id,p.school);
        if(targets.isEmpty()) throw error(404,"申请不在本校范围");
        if(targets.get(0)==actor) throw error(403,"不能审核自己的身份申请");
        var target=principal(targets.get(0),true);
        if(target.school!=p.school) throw error(404,"申请不在本校范围");
        Item old=db.query(SELECT+"WHERE a.id=? AND a.school_id=?",(r,n)->row(r),id,p.school).get(0);
        if(old.revision!=input.revision) throw error(409,"此申请已被其他页面更新，请刷新后核对");
        boolean allowed=switch(input.decision) {
            case "APPROVE","REJECT" -> "PENDING".equals(old.status);
            case "REVOKE" -> "APPROVED".equals(old.status);
            case "RESTORE" -> "REVOKED".equals(old.status);
            default -> false;
        };
        if(!allowed) throw error(409,"当前身份状态不能执行此审核操作");
        String next=switch(input.decision) { case "REJECT" -> "REJECTED";case "REVOKE" -> "REVOKED";default -> "APPROVED"; };
        if(db.update("UPDATE teaching_identities SET status=?,revision=revision+1,reason=?,reviewed_at=? WHERE id=? AND school_id=? AND revision=?",
                next,reason,Timestamp.from(clock.instant()),id,p.school,input.revision)!=1) throw error(409,"此申请已更新");
        audit(id,p.school,actor,input.revision+1,old.status,next,reason);
        // No users.role, teaching_courses or teaching_grants writes here.
        return db.query(SELECT+"WHERE a.id=? AND a.school_id=?",(r,n)->row(r),id,p.school).get(0);
    }
    private void audit(String id,long school,long actor,int revision,String old,String next,String reason) {
        db.update("INSERT INTO teaching_identity_audit(id,application_id,school_id,actor_id,revision,old_status,new_status,reason,recorded_at) VALUES(?,?,?,?,?,?,?,?,?)",
                UUID.randomUUID().toString(),id,school,actor,revision,old,next,reason,Timestamp.from(clock.instant()));
    }
    public Set<String> approvedRoles(long user) {
        if(!enabled) return STAFF; // Explicit legacy grants remain authoritative until the reviewed-identity rollout is enabled.
        var p=principal(user,false);
        return new HashSet<>(db.queryForList("SELECT requested_role FROM teaching_identities WHERE user_id=? AND school_id=? AND status='APPROVED'",String.class,user,p.school));
    }
    public void requireApproved(long user, String role) {
        if(!approvedRoles(user).contains(role)) throw error(403,"请先审核通过该账号的教学身份，再配置课程或负责范围");
    }
}
