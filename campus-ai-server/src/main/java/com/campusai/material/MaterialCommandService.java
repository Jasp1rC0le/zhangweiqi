package com.campusai.material;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;
import java.util.function.Supplier;

/** Receipts are committed atomically with the existing business operation. */
@Service
public class MaterialCommandService {
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    public MaterialCommandService(JdbcTemplate jdbc, ObjectMapper json) { this.jdbc=jdbc; this.json=json; }
    public record Actor(long id, long schoolId, String role) {}
    public record Receipt(String requestId, String kind, JsonNode result) {}
    public Actor actor(Long userId, boolean admin) {
        if (userId == null) throw error(HttpStatus.UNAUTHORIZED, "请先登录");
        var rows=jdbc.query("SELECT id,school_id,role FROM users WHERE id=? AND status=1",
            (r,n)->new Actor(r.getLong(1),r.getLong(2),r.getString(3)),userId);
        if(rows.size()!=1 || rows.get(0).schoolId()<=0) throw error(HttpStatus.FORBIDDEN,"账户不可用");
        var actor=rows.get(0);
        if(admin && !"ADMIN".equals(actor.role())) throw error(HttpStatus.FORBIDDEN,"需要本校管理员权限");
        return actor;
    }
    public boolean available() {
        try { jdbc.query("SELECT request_id FROM material_command_receipts WHERE 1=0",(r,n)->r.getString(1)); return true; }
        catch(org.springframework.jdbc.BadSqlGrammarException e) { return false; }
    }
    @Transactional(timeout=15)
    public Receipt execute(Long owner, String requestId, String kind, Object payload, Supplier<Object> write) {
        validateId(requestId); boolean admin="MERCHANT_DRAFT".equals(kind);
        actor(owner,admin);
        jdbc.queryForObject("SELECT id FROM users WHERE id=? FOR UPDATE",Long.class,owner);
        var actor=actor(owner,admin);
        if(!available()) throw error(HttpStatus.SERVICE_UNAVAILABLE,"资料回执存储尚未启用，请联系管理员；没有提交");
        var fingerprint=hash(json.writeValueAsString(payload));
        var prior=rows(actor,requestId);
        if(!prior.isEmpty()) {
            var row=prior.get(0);
            if(!row.kind.equals(kind)||!row.fingerprint.equals(fingerprint)) throw error(HttpStatus.CONFLICT,"这个请求编号已用于其他内容，请核对原回执");
            return new Receipt(requestId,kind,json.readTree(row.result));
        }
        Object result=write.get();
        String encoded=json.writeValueAsString(result);
        jdbc.update("INSERT INTO material_command_receipts(owner_id,school_id,request_id,kind,payload_sha256,result_json) VALUES(?,?,?,?,?,?)",
            actor.id(),actor.schoolId(),requestId,kind,fingerprint,encoded);
        return new Receipt(requestId,kind,json.readTree(encoded));
    }
    @Transactional(readOnly=true,timeout=5)
    public Receipt read(Long owner,String requestId) {
        validateId(requestId); var actor=actor(owner,false);
        if(!available()) throw error(HttpStatus.SERVICE_UNAVAILABLE,"资料回执存储尚未启用");
        var found=rows(actor,requestId);
        if(found.isEmpty()) throw error(HttpStatus.NOT_FOUND,"尚未找到这个账号的提交回执；不要直接重发新请求");
        var row=found.get(0);
        if("MERCHANT_DRAFT".equals(row.kind) && !"ADMIN".equals(actor.role())) throw error(HttpStatus.FORBIDDEN,"管理员权限已变化，不能读取该商家操作回执");
        return new Receipt(requestId,row.kind,json.readTree(row.result));
    }
    private record Row(String kind,String fingerprint,String result) {}
    private List<Row> rows(Actor actor,String key) {
        return jdbc.query("SELECT kind,payload_sha256,result_json FROM material_command_receipts WHERE owner_id=? AND school_id=? AND request_id=?",
            (r,n)->new Row(r.getString(1),r.getString(2),r.getString(3)),actor.id(),actor.schoolId(),key);
    }
    private void validateId(String id) {
        try { if(id==null||!UUID.fromString(id).toString().equals(id))throw new IllegalArgumentException(); }
        catch(IllegalArgumentException e){throw error(HttpStatus.BAD_REQUEST,"请求编号须为规范UUID");}
    }
    private String hash(String text) {
        try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8)));}
        catch(java.security.NoSuchAlgorithmException e){throw new IllegalStateException(e);}
    }
    private static ResponseStatusException error(HttpStatus code,String message){return new ResponseStatusException(code,message);}
}
