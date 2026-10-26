package com.campusai.teaching;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;

/** Normal ADMIN only. Reviewed identity is separate from current class/college responsibility. */
@Service
public class TeachingResponsibilityService {
    private final JdbcTemplate db;
    private final TeachingService teaching;
    private final TeachingIdentityService identities;
    private final boolean enabled;
    private final Clock clock;
    @Autowired public TeachingResponsibilityService(JdbcTemplate db,TeachingService teaching,TeachingIdentityService identities,
            @Value("${app.teaching.responsibility-enabled:false}") boolean enabled){this(db,teaching,identities,enabled,Clock.systemUTC());}
    public TeachingResponsibilityService(JdbcTemplate db,TeachingService teaching,TeachingIdentityService identities,boolean enabled,Clock clock){this.db=db;this.teaching=teaching;this.identities=identities;this.enabled=enabled;this.clock=clock;}
    public record Access(boolean enabled,int maxPageSize,boolean reasonRequired){}
    public record Target(long userId,String account,String viewRole,String scopeKey,String scopeLabel,int revision,boolean active,boolean eligible,String baselineNote){}
    public record Item(String scopeKey,String scopeLabel,int revision){}
    public record Page(long userId,String account,String viewRole,int revision,List<Item> items,int page,int size,int total,int totalPages){}
    public record Change(String requestId,long userId,String viewRole,String scopeKey,int revision,String action,String reason){}
    public record Receipt(String requestId,long actorId,long userId,String viewRole,String scopeKey,String scopeLabel,String action,
            boolean oldActive,boolean newActive,int oldRevision,int revision,String reason,Instant recordedAt){}
    private record Account(long id,long school,String role,int status,String label){}
    private record Version(int revision,String source){}
    private static ResponseStatusException error(int code,String text){return new ResponseStatusException(HttpStatus.valueOf(code),text);}
    private Account account(long id){
        var rows=db.query("SELECT id,school_id,role,status,username,nickname FROM users WHERE id=?",(r,n)->new Account(r.getLong(1),r.getLong(2),r.getString(3),r.getInt(4),r.getString(5)+" · "+r.getString(6)),id);
        if(rows.isEmpty())throw error(404,"账号不存在或不在本校范围");return rows.get(0);
    }
    private Account authorize(long actor){teaching.capabilities(actor);var p=account(actor);if(p.status!=1||!"ADMIN".equals(p.role))throw error(403,"需要本校正常管理员权限");return p;}
    private void ready(){if(!enabled||identities==null||!identities.enabled())throw error(503,"受控负责范围尚未启用，请先完成手动迁移和身份审核配置");}
    public Access access(long actor){authorize(actor);return new Access(enabled&&identities!=null&&identities.enabled(),100,true);}
    private static void role(String role){if(!Set.of("COUNSELOR","SECRETARY").contains(role==null?"":role))throw error(400,"请选择辅导员或书记");}
    private Account target(Account p,long user){if(user<1)throw error(400,"填写已核实账号编号，不是学号");var t=account(user);if(t.school!=p.school)throw error(404,"账号不存在或不在本校范围");return t;}
    private Version version(long school,long user,String role){
        var rows=db.query("SELECT revision,source FROM teaching_grant_versions WHERE school_id=? AND user_id=? AND view_role=?",(r,n)->new Version(r.getInt(1),r.getString(2)),school,user,role);
        if(!rows.isEmpty()){if(rows.get(0).revision<0)throw error(503,"负责范围版本异常，未返回部分权限");return rows.get(0);}
        if(db.queryForObject("SELECT COUNT(*) FROM teaching_grants WHERE school_id=? AND user_id=? AND view_role=?",Integer.class,school,user,role)>0)throw error(503,"原有负责范围尚未建立迁移基线，请管理员核对");
        return new Version(0,"NO_PRIOR_ASSIGNMENT");
    }
    private boolean active(long school,long user,String role,String key){return db.queryForObject("SELECT COUNT(*) FROM teaching_grants WHERE school_id=? AND user_id=? AND view_role=? AND scope_key=?",Integer.class,school,user,role,key)==1;}
    private String label(long school,String role,String key,boolean existing){
        if(key==null||key.isBlank()||key.length()>100||key.chars().anyMatch(Character::isISOControl))throw error(400,"请从已核实的班级或学院中选择负责范围");
        List<String> labels;
        if("COUNSELOR".equals(role))labels=db.queryForList("SELECT CONCAT(college,' · ',name) FROM teaching_classes WHERE school_id=? AND id=?",String.class,school,key);
        else labels=db.queryForList("SELECT DISTINCT college FROM teaching_classes WHERE school_id=? AND college=?",String.class,school,key);
        if(labels.isEmpty()){if(existing)return key+"（原范围定义已不存在，可撤销）";throw error(404,"范围不存在或不在本校，未授予权限");}
        if("SECRETARY".equals(role)&&!labels.get(0).equals(key))throw error(400,"学院名称已变化，请重新选择准确范围");
        return labels.get(0);
    }
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public Target check(long actor,long user,String viewRole,String scopeKey){
        var p=authorize(actor);ready();role(viewRole);var t=target(p,user);var v=version(p.school,user,viewRole);boolean exists=active(p.school,user,viewRole,scopeKey);
        return new Target(user,t.label,viewRole,scopeKey,label(p.school,viewRole,scopeKey,exists),v.revision,exists,t.status==1&&identities.approvedRoles(user).contains(viewRole),"BASELINE_AT_MIGRATION".equals(v.source)?"原有权限为迁移时基线，不推断最初授权人和时间。":"当前范围版本；不代表平台管理员身份。");
    }
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public Page page(long actor,long user,String viewRole,int page,int size){
        var p=authorize(actor);ready();role(viewRole);var t=target(p,user);var v=version(p.school,user,viewRole);
        if(page<0||page>10000||size<1||size>100)throw error(400,"负责范围每页限1至100条");
        int total=db.queryForObject("SELECT COUNT(*) FROM teaching_grants WHERE school_id=? AND user_id=? AND view_role=?",Integer.class,p.school,user,viewRole);
        int pages=(total+size-1)/size;if(page>0&&page>=pages)throw error(409,"负责范围已变化，请重新读取第一页");
        String display="COUNSELOR".equals(viewRole)?"COALESCE(CONCAT(b.college,' · ',b.name),CONCAT(g.scope_key,'（原范围定义已不存在，可撤销）'))":"g.scope_key";
        String joined="COUNSELOR".equals(viewRole)?" LEFT JOIN teaching_classes b ON b.id=g.scope_key AND b.school_id=g.school_id":"";
        var items=db.query("SELECT g.scope_key,"+display+" AS scope_label FROM teaching_grants g"+joined+" WHERE g.school_id=? AND g.user_id=? AND g.view_role=? ORDER BY g.scope_key LIMIT ? OFFSET ?",(r,n)->new Item(r.getString(1),r.getString(2),v.revision),p.school,user,viewRole,size,page*size);
        return new Page(user,t.label,viewRole,v.revision,items,page,size,total,pages);
    }
    private Receipt receipt(long school,String request,long actor){
        var rows=db.query("SELECT * FROM teaching_grant_audit WHERE school_id=? AND request_id=? AND actor_id=?",(r,n)->new Receipt(r.getString("request_id"),r.getLong("actor_id"),r.getLong("user_id"),r.getString("view_role"),r.getString("scope_key"),r.getString("scope_label"),r.getString("action"),r.getBoolean("old_active"),r.getBoolean("new_active"),r.getInt("old_revision"),r.getInt("revision"),r.getString("reason"),r.getTimestamp("recorded_at").toInstant()),school,request,actor);
        return rows.isEmpty()?null:rows.get(0);
    }
    private static void uuid(String id){if(id==null||!id.matches("[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}"))throw error(400,"操作请求编号无效");}
    @Transactional(readOnly=true) public Receipt request(long actor,String id){var p=authorize(actor);ready();uuid(id);var result=receipt(p.school,id,actor);if(result==null)throw error(404,"尚未查到本次回执；不能据此新建请求重复提交");return result;}
    private static String hash(Change input){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest((input.userId+"\n"+input.viewRole+"\n"+input.scopeKey+"\n"+input.revision+"\n"+input.action+"\n"+input.reason).getBytes(StandardCharsets.UTF_8)));}catch(java.security.NoSuchAlgorithmException e){throw new IllegalStateException(e);}}
    @Transactional(isolation=Isolation.READ_COMMITTED,timeout=12)
    public Receipt change(long actor,Change input){
        var p=authorize(actor);ready();if(input==null)throw error(400,"负责范围变更资料缺失");uuid(input.requestId);role(input.viewRole);
        if(input.userId<1||input.revision<0||!Set.of("GRANT","REVOKE").contains(input.action==null?"":input.action)||input.reason==null||input.reason.isBlank()||input.reason.length()>300||input.reason.chars().anyMatch(Character::isISOControl))throw error(400,"选择明确操作并填写1至300字原因");
        if(input.scopeKey==null||input.scopeKey.isBlank()||input.scopeKey.length()>100||input.scopeKey.chars().anyMatch(Character::isISOControl))throw error(400,"负责范围无效");
        String fingerprint=hash(input);
        // Stable lock order prevents two administrators changing one another from deadlocking.
        db.queryForList("SELECT id FROM users WHERE id IN (?,?) ORDER BY id FOR UPDATE",Long.class,actor,input.userId);
        p=authorize(actor);
        var old=receipt(p.school,input.requestId,actor);
        if(old!=null){String saved=db.queryForObject("SELECT request_hash FROM teaching_grant_audit WHERE school_id=? AND request_id=?",String.class,p.school,input.requestId);if(!fingerprint.equals(saved))throw error(409,"同一请求内容已变化，不能冒认原回执");return old;}
        if(db.queryForObject("SELECT COUNT(*) FROM teaching_grant_audit WHERE school_id=? AND request_id=?",Integer.class,p.school,input.requestId)>0)throw error(409,"请求编号已被使用，请重新核对");
        var t=target(p,input.userId);var v=version(p.school,input.userId,input.viewRole);if(v.revision!=input.revision)throw error(409,"负责范围版本已变化，请重新核对，未覆盖其他页面操作");
        if(v.revision==Integer.MAX_VALUE)throw error(409,"负责范围版本达到上限，请管理员处理，不回绕版本");
        boolean before=active(p.school,input.userId,input.viewRole,input.scopeKey),after="GRANT".equals(input.action);
        if(before==after)throw error(409,"当前权限已是目标状态，请重新读取；不冒充本次保存成功");
        String scopeLabel=label(p.school,input.viewRole,input.scopeKey,before);
        if(after){if(t.status!=1)throw error(403,"停用账号不能增加负责范围");identities.requireApproved(input.userId,input.viewRole);}
        if("NO_PRIOR_ASSIGNMENT".equals(v.source))db.update("INSERT INTO teaching_grant_versions VALUES(?,?,?,?,?)",p.school,input.userId,input.viewRole,0,"CAPTURED_AT_CHANGE");
        if(after)db.update("INSERT INTO teaching_grants VALUES(?,?,?,?)",p.school,input.userId,input.viewRole,input.scopeKey);
        else if(db.update("DELETE FROM teaching_grants WHERE school_id=? AND user_id=? AND view_role=? AND scope_key=?",p.school,input.userId,input.viewRole,input.scopeKey)!=1)throw error(409,"负责范围已变化");
        if(db.update("UPDATE teaching_grant_versions SET revision=revision+1 WHERE school_id=? AND user_id=? AND view_role=? AND revision=?",p.school,input.userId,input.viewRole,v.revision)!=1)throw error(409,"负责范围版本冲突");
        Instant now=clock.instant().truncatedTo(java.time.temporal.ChronoUnit.SECONDS);
        db.update("INSERT INTO teaching_grant_audit VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",p.school,input.requestId,actor,input.userId,input.viewRole,input.scopeKey,scopeLabel,t.label,p.label,input.action,before,after,v.revision,v.revision+1,input.reason,fingerprint,Timestamp.from(now));
        return receipt(p.school,input.requestId,actor);
    }
}
