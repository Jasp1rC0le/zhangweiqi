package com.campusai.material;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import java.nio.file.*;
import java.nio.file.attribute.PosixFilePermissions;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.util.*;

@Service
public class PrivateMaterialService {
    static final long MAX_FILE=10L*1024*1024, USER_BYTES=100L*1024*1024, TOTAL_BYTES=2L*1024*1024*1024;
    private final JdbcTemplate jdbc; private final MaterialCommandService auth; private final Path root;
    public PrivateMaterialService(JdbcTemplate jdbc,MaterialCommandService auth,@Value("${app.materials.storage-dir:.local/private-materials}") String folder){
        this.jdbc=jdbc;this.auth=auth;this.root=Path.of(folder).toAbsolutePath().normalize();
    }
    public record FileInfo(String id,String name,long bytes,String sha256,String createdAt,int textLength){}
    public record Page(List<FileInfo> items,long total,int page,int size){}
    public record Download(FileInfo info,Path path){}
    public record Capabilities(boolean privateOriginals,long maxBytes,long userQuotaBytes){}
    public Capabilities capabilities(Long owner){auth.actor(owner,false);return new Capabilities(available(),MAX_FILE,USER_BYTES);}
    private boolean available(){try{jdbc.queryForList("SELECT id FROM private_material_files WHERE 1=0");return jdbc.queryForObject("SELECT COUNT(*) FROM private_material_quota WHERE id=1",Integer.class)==1;}catch(org.springframework.jdbc.BadSqlGrammarException e){return false;}}
    private void ready(){if(!available())throw error(503,"私有原件存储尚未启用，文件仍在本机，不要重复上传");}
    // Auth reads precede the quota lock. READ_COMMITTED makes the sums after
    // that lock observe a competing upload's commit instead of an older snapshot.
    @Transactional(timeout=30,isolation=org.springframework.transaction.annotation.Isolation.READ_COMMITTED)
    public FileInfo save(Long owner,String requestId,MultipartFile file,String extracted) throws IOException {
        var actor=auth.actor(owner,false);ready();
        if(requestId==null || !requestId.matches("[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}"))throw error(400,"上传请求编号无效");
        if(file==null||file.isEmpty()||file.getSize()>MAX_FILE)throw error(400,"原件须为非空且不超过10MB");
        String name=Objects.toString(file.getOriginalFilename(),"附件").replace('\\','/');name=name.substring(name.lastIndexOf('/')+1).replaceAll("[\\p{Cntrl}]","");
        if(name.isBlank()||name.length()>180)throw error(400,"文件名须为1至180字");
        String ext=name.substring(name.lastIndexOf('.')+1).toLowerCase(Locale.ROOT);
        if(!Set.of("pdf","docx","xlsx","txt","md","csv","jpg","jpeg","png","webp","mp4","mov","webm").contains(ext))throw error(400,"不支持这个原件类型");
        String text=extracted==null?"":extracted;
        if(text.length()>500000||text.indexOf('\0')>=0)throw error(400,"提取文本限50万字符且不能含空字节");
        byte[] textBytes=text.getBytes(StandardCharsets.UTF_8);
        // One short global quota lock serializes original uploads, not ordinary application requests.
        jdbc.queryForObject("SELECT id FROM private_material_quota WHERE id=1 FOR UPDATE",Integer.class);
        jdbc.queryForObject("SELECT id FROM users WHERE id=? FOR UPDATE",Long.class,owner);
        actor=auth.actor(owner,false);
        Files.createDirectories(root);if(Files.isSymbolicLink(root))throw error(503,"私有存储目录配置异常");
        Files.setPosixFilePermissions(root,PosixFilePermissions.fromString("rwx------"));
        if(Files.getFileStore(root).getUsableSpace()<256L*1024*1024+MAX_FILE)throw error(503,"服务器可用磁盘不足，未保存原件");
        Path temp=Files.createTempFile(root,"incoming-",".tmp");Files.setPosixFilePermissions(temp,PosixFilePermissions.fromString("rw-------"));
        try {
            MessageDigest digest=sha();long length=0;
            try(InputStream in=file.getInputStream();OutputStream out=Files.newOutputStream(temp)){
                byte[] buffer=new byte[32768];int n;
                while((n=in.read(buffer))!=-1){length+=n;if(length>MAX_FILE)throw error(413,"文件超过10MB");digest.update(buffer,0,n);out.write(buffer,0,n);}
            }
            if(length!=file.getSize())throw error(400,"上传文件长度不一致，请重新选择文件");
            String hash=HexFormat.of().formatHex(digest.digest()), textHash=HexFormat.of().formatHex(sha().digest(textBytes));
            var prior=jdbc.queryForList("SELECT id,name,sha256,text_sha256 FROM private_material_files WHERE owner_id=? AND request_id=?",owner,requestId);
            if(!prior.isEmpty()){
                var row=prior.get(0);if(!name.equals(row.get("name"))||!hash.equals(row.get("sha256"))||!textHash.equals(row.get("text_sha256")))throw error(409,"同一上传编号的内容已变化");
                return info(owner,Objects.toString(row.get("id")));
            }
            // Budget includes original bytes on disk and UTF-8 text in the DB.
            // This is a payload budget, not an assertion about physical DB/index/backup size.
            long used=jdbc.queryForObject("SELECT COALESCE(SUM(byte_size+OCTET_LENGTH(extracted_text)),0) FROM private_material_files WHERE owner_id=?",Long.class,owner);
            long total=jdbc.queryForObject("SELECT COALESCE(SUM(byte_size+OCTET_LENGTH(extracted_text)),0) FROM private_material_files",Long.class);
            int count=jdbc.queryForObject("SELECT COUNT(*) FROM private_material_files WHERE owner_id=?",Integer.class,owner);
            long incoming=length+textBytes.length;
            if(used+incoming>USER_BYTES||total+incoming>TOTAL_BYTES||count>=100)throw error(409,"私有原件与提取文本合计空间或文件数已达上限，请由管理员核对容量；没有覆盖旧文件");
            String id=UUID.randomUUID().toString();Path destination=root.resolve(id+".bin");Files.move(temp,destination,StandardCopyOption.ATOMIC_MOVE);
            if(!TransactionSynchronizationManager.isSynchronizationActive()){Files.deleteIfExists(destination);throw new IllegalStateException("Transactional upload required");}
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization(){@Override public void afterCompletion(int status){if(status!=STATUS_COMMITTED)try{Files.deleteIfExists(destination);}catch(IOException ignored){/* orphan is inaccessible without owner metadata */}}});
            jdbc.update("INSERT INTO private_material_files(id,owner_id,school_id,request_id,name,byte_size,sha256,text_sha256,extracted_text) VALUES(?,?,?,?,?,?,?,?,?)",id,owner,actor.schoolId(),requestId,name,length,hash,textHash,text);
            return info(owner,id);
        } finally {Files.deleteIfExists(temp);}
    }
    public FileInfo info(Long owner,String id){
        var actor=auth.actor(owner,false);ready();
        var rows=jdbc.query("SELECT id,name,byte_size,sha256,created_at,CHAR_LENGTH(extracted_text) AS text_length FROM private_material_files WHERE owner_id=? AND school_id=? AND id=?",(r,n)->new FileInfo(r.getString(1),r.getString(2),r.getLong(3),r.getString(4),r.getTimestamp(5).toInstant().toString(),r.getInt(6)),owner,actor.schoolId(),id);
        if(rows.isEmpty())throw error(404,"没有这份本人原件");return rows.get(0);
    }
    @Transactional(readOnly=true,isolation=org.springframework.transaction.annotation.Isolation.REPEATABLE_READ)
    public Page list(Long owner,int page){
        var actor=auth.actor(owner,false);ready();if(page<0||page>4)throw error(400,"页码无效");
        long total=jdbc.queryForObject("SELECT COUNT(*) FROM private_material_files WHERE owner_id=? AND school_id=?",Long.class,owner,actor.schoolId());
        var rows=jdbc.query("SELECT id,name,byte_size,sha256,created_at,CHAR_LENGTH(extracted_text) FROM private_material_files WHERE owner_id=? AND school_id=? ORDER BY created_at DESC,id LIMIT 25 OFFSET ?",(r,n)->new FileInfo(r.getString(1),r.getString(2),r.getLong(3),r.getString(4),r.getTimestamp(5).toInstant().toString(),r.getInt(6)),owner,actor.schoolId(),page*25);
        return new Page(rows,total,page,25);
    }
    public String text(Long owner,String id){info(owner,id);return jdbc.queryForObject("SELECT extracted_text FROM private_material_files WHERE id=? AND owner_id=?",String.class,id,owner);}
    public Download download(Long owner,String id) throws IOException {
        var info=info(owner,id);Path path=root.resolve(info.id()+".bin");
        if(!path.getParent().equals(root)||Files.isSymbolicLink(path)||!Files.isRegularFile(path)||Files.size(path)!=info.bytes())throw error(503,"原件文件缺失或损坏，请联系管理员恢复；不返回不完整文件");
        try(InputStream in=Files.newInputStream(path)){var digest=sha();byte[] buffer=new byte[32768];int n;while((n=in.read(buffer))!=-1)digest.update(buffer,0,n);if(!HexFormat.of().formatHex(digest.digest()).equals(info.sha256()))throw error(503,"原件校验失败，请联系管理员恢复");}
        return new Download(info,path);
    }
    private static MessageDigest sha(){try{return MessageDigest.getInstance("SHA-256");}catch(NoSuchAlgorithmException e){throw new IllegalStateException(e);}}
    private static ResponseStatusException error(int code,String msg){return new ResponseStatusException(HttpStatus.valueOf(code),msg);}
}
