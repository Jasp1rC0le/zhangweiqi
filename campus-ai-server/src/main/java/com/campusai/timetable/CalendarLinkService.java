package com.campusai.timetable;

import com.campusai.security.JwtService;
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
import java.security.SecureRandom;
import java.sql.Timestamp;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.concurrent.Semaphore;

/** Reuses the existing action-grant store; no schema migration or raw signing key export. */
@Service
public class CalendarLinkService {
    private static final String ACTIONS="('CAL_FEED_5','CAL_FEED_10','CAL_FEED_15','CAL_FEED_30')";
    private static final ZoneId ZONE=ZoneId.of("Asia/Shanghai");
    private final JdbcTemplate db;
    private final ScheduleExportSource source;
    private final ScheduleFileWriter writer;
    private final JwtService signer;
    private final Clock clock;
    private final String web;
    private final SecureRandom random=new SecureRandom();
    private final Semaphore encoders=new Semaphore(2);
    private final LinkedHashMap<String,Cached> cache=new LinkedHashMap<>();
    private record Grant(String id,long user,String action,String school,Instant expires) {}
    private record Cached(byte[] bytes,String sha,Instant until) {}
    public record Link(boolean active,String url,Instant expiresAt,int minutes,Integer count,LocalDate from,LocalDate to) {}
    public record Calendar(byte[] bytes,String sha) {}
    @Autowired public CalendarLinkService(JdbcTemplate db,ScheduleExportSource source,ScheduleFileWriter writer,JwtService signer,
            @Value("${app.auth.public-web-url:http://localhost:5173}") String web) {
        this(db,source,writer,signer,web,Clock.systemUTC());
    }
    public CalendarLinkService(JdbcTemplate db,ScheduleExportSource source,ScheduleFileWriter writer,JwtService signer,String web,Clock clock) {
        this.db=db;this.source=source;this.writer=writer;this.signer=signer;this.web=web.replaceAll("/+$","");this.clock=clock;
        var uri=java.net.URI.create(this.web);
        if(uri.getHost()==null || uri.getUserInfo()!=null || uri.getQuery()!=null || uri.getFragment()!=null
                || !("https".equals(uri.getScheme()) || "http".equals(uri.getScheme()) && Set.of("localhost","127.0.0.1").contains(uri.getHost())))
            throw new IllegalArgumentException("Calendar links require the canonical HTTPS origin");
    }
    private static ResponseStatusException error(int code,String message){return new ResponseStatusException(HttpStatus.valueOf(code),message);}
    private Instant now(){return clock.instant();}
    private Long activeSchool(long user,boolean lock){
        var rows=db.queryForList("SELECT school_id FROM users WHERE id=? AND status=1"+(lock?" FOR UPDATE":""),Long.class,user);
        if(rows.isEmpty()||rows.get(0)==null)throw error(403,"账号不可用，请重新登录");return rows.get(0);
    }
    private List<Grant> ownGrants(long user){return db.query("SELECT token_hash,user_id,action,pending_email,expires_at FROM account_action_tokens WHERE user_id=? AND action IN "+ACTIONS+" AND used_at IS NULL AND expires_at>? ORDER BY created_at DESC",
            (rs,n)->new Grant(rs.getString(1),rs.getLong(2),rs.getString(3),rs.getString(4),rs.getTimestamp(5).toInstant()),user,Timestamp.from(now()));}
    private int minutes(Grant grant){return Integer.parseInt(grant.action().substring("CAL_FEED_".length()));}
    private LocalDate day(){return LocalDate.now(clock.withZone(ZONE));}
    private Link view(Grant grant,Integer count){return new Link(true,web+"/api/calendar-feed/"+grant.id()+"."+signer.calendarLinkProof(grant.id())+"/calendar.ics",grant.expires(),minutes(grant),count,day(),day().plusDays(27));}
    private ScheduleExportSource.Filter filter(int minutes){return new ScheduleExportSource.Filter("PERSONAL","STUDENT",day(),day().plusDays(27),"","ALL","ICS","",true,minutes);}
    public Link status(long user){return status(user,()->true);}
    @Transactional(isolation=Isolation.REPEATABLE_READ)
    public Link status(long user,java.util.function.BooleanSupplier session){long school=activeSchool(user,true);if(!session.getAsBoolean())throw error(401,"登录状态已变化");return ownGrants(user).stream().filter(g->Long.toString(school).equals(g.school())).findFirst().map(g->view(g,null)).orElse(new Link(false,null,null,10,null,day(),day().plusDays(27)));}
    public Link enable(long user,int minutes){return enable(user,minutes,()->true);}
    @Transactional(isolation=Isolation.REPEATABLE_READ)
    public Link enable(long user,int minutes,java.util.function.BooleanSupplier session){
        if(!Set.of(5,10,15,30).contains(minutes))throw error(400,"请选择5、10、15或30分钟");
        long school=activeSchool(user,true);
        if(!session.getAsBoolean())throw error(401,"登录状态已变化");
        var snapshot=source.read(user,filter(minutes));
        if(snapshot.entries().stream().anyMatch(row->row.startTime()==null||row.endTime()==null))throw error(400,"课程钟点未补齐，请先核对课表");
        int count=(int)snapshot.entries().stream().filter(row->!row.cancelled()).count();
        if(count==0)throw error(400,"当前没有可导入的本人课程");
        Grant grant=ownGrants(user).stream().filter(g->Long.toString(school).equals(g.school())).findFirst().orElse(null);
        String action="CAL_FEED_"+minutes;
        if(grant==null){
            db.update("DELETE FROM account_action_tokens WHERE user_id=? AND action IN "+ACTIONS,user);
            byte[] bytes=new byte[32];random.nextBytes(bytes);String id=ScheduleFileWriter.hash(bytes);Instant expiry=now().plus(Duration.ofDays(180)).truncatedTo(ChronoUnit.SECONDS);
            // For this distinct grant namespace, legacy action metadata binds the school id.
            // Recovery actions still use this nullable column for their pending email only.
            db.update("INSERT INTO account_action_tokens(token_hash,user_id,action,pending_email,expires_at) VALUES(?,?,?,?,?)",id,user,action,Long.toString(school),Timestamp.from(expiry));
            grant=new Grant(id,user,action,Long.toString(school),expiry);
        }else{
            db.update("UPDATE account_action_tokens SET action=? WHERE token_hash=? AND user_id=?",action,grant.id(),user);
            grant=new Grant(grant.id(),user,action,grant.school(),grant.expires());
        }
        synchronized(cache){cache.remove(grant.id());}
        return view(grant,count);
    }
    public void revoke(long user){revoke(user,()->true);}
    @Transactional
    public void revoke(long user,java.util.function.BooleanSupplier session){activeSchool(user,true);if(!session.getAsBoolean())throw error(401,"登录状态已变化");for(var grant:ownGrants(user))synchronized(cache){cache.remove(grant.id());}db.update("DELETE FROM account_action_tokens WHERE user_id=? AND action IN "+ACTIONS,user);}
    private String checkedId(String token){
        if(token==null||!token.matches("[a-f0-9]{64}\\.[A-Za-z0-9_-]{43}"))throw error(404,"日历链接不可用");
        String id=token.substring(0,64),proof=token.substring(65);
        if(!MessageDigest.isEqual(proof.getBytes(StandardCharsets.US_ASCII),signer.calendarLinkProof(id).getBytes(StandardCharsets.US_ASCII)))throw error(404,"日历链接不可用");return id;
    }
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public Calendar read(String token)throws java.io.IOException{
        String id=checkedId(token);
        var grants=db.query("SELECT t.token_hash,t.user_id,t.action,t.pending_email,t.expires_at,u.school_id FROM account_action_tokens t JOIN users u ON u.id=t.user_id AND u.status=1 WHERE t.token_hash=? AND t.action IN "+ACTIONS+" AND t.used_at IS NULL AND t.expires_at>?",
                (rs,n)->new Object[]{new Grant(rs.getString(1),rs.getLong(2),rs.getString(3),rs.getString(4),rs.getTimestamp(5).toInstant()),rs.getLong(6)},id,Timestamp.from(now()));
        if(grants.isEmpty())throw error(410,"日历链接已停用或到期");
        Grant grant=(Grant)grants.get(0)[0];if(!Long.toString((Long)grants.get(0)[1]).equals(grant.school()))throw error(410,"日历归属已变化");
        synchronized(cache){Cached cached=cache.get(id);if(cached!=null&&cached.until().isAfter(now()))return new Calendar(cached.bytes().clone(),cached.sha());}
        if(!encoders.tryAcquire())throw error(503,"日历暂时繁忙");
        try{
            var snapshot=source.read(grant.user(),filter(minutes(grant)));
            // An unknown clock must never preserve an old timed alarm or invent a new one.
            var known=snapshot.entries().stream().filter(row->row.startTime()!=null&&row.endTime()!=null)
                    .map(row->new ScheduleExportSource.Row(row.id(),row.date(),row.name(),row.room(),"","",row.startTime(),row.endTime(),row.timeLabel(),List.of("PERSONAL"),row.cancelled())).toList();
            var checked=new ScheduleExportSource.Snapshot(snapshot.filter(),snapshot.scopeLabel(),known,snapshot.warnings());
            String calendar=new String(writer.write(checked,now()).bytes(),StandardCharsets.UTF_8)
                    .replace("CALSCALE:GREGORIAN\r\n","CALSCALE:GREGORIAN\r\nX-WR-CALNAME:Campthink课表\r\nX-WR-TIMEZONE:Asia/Shanghai\r\nREFRESH-INTERVAL;VALUE=DURATION:PT1H\r\nX-PUBLISHED-TTL:PT1H\r\n");
            byte[] bytes=calendar.getBytes(StandardCharsets.UTF_8);if(bytes.length>4*1024*1024)throw error(413,"请缩小日历范围");
            String sha=ScheduleFileWriter.hash(bytes);
            synchronized(cache){
                cache.entrySet().removeIf(e->!e.getValue().until().isAfter(now()));
                while(!cache.isEmpty()&&(cache.size()>=32||cache.values().stream().mapToInt(c->c.bytes().length).sum()+bytes.length>16*1024*1024))cache.remove(cache.keySet().iterator().next());
                cache.put(id,new Cached(bytes.clone(),sha,now().plusSeconds(30)));
            }
            return new Calendar(bytes,sha);
        }finally{encoders.release();}
    }
}
