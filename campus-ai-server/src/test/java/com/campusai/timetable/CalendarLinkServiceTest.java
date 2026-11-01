package com.campusai.timetable;

import com.campusai.security.JwtService;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class CalendarLinkServiceTest {
    JdbcTemplate db;ScheduleExportSource source;CalendarLinkService service;JwtService jwt;MutableClock clock;
    static class MutableClock extends Clock {
        Instant time=Instant.parse("2026-11-01T01:00:00Z");
        public ZoneId getZone(){return ZoneOffset.UTC;}public Clock withZone(ZoneId zone){return Clock.fixed(time,zone);}public Instant instant(){return time;}
    }
    @BeforeEach void setup(){
        var data=new DriverManagerDataSource("jdbc:h2:mem:"+UUID.randomUUID()+";MODE=MySQL;DB_CLOSE_DELAY=-1","sa","");db=new JdbcTemplate(data);
        db.execute("CREATE TABLE users(id BIGINT PRIMARY KEY,school_id BIGINT,status INT)");
        db.execute("CREATE TABLE account_action_tokens(token_hash CHAR(64) PRIMARY KEY,user_id BIGINT,action VARCHAR(24),pending_email VARCHAR(254),expires_at TIMESTAMP,used_at TIMESTAMP,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)");
        db.update("INSERT INTO users VALUES(1,1,1),(2,1,1)");source=mock(ScheduleExportSource.class);clock=new MutableClock();
        jwt=new JwtService(Base64.getEncoder().encodeToString("synthetic-calendar-root-for-tests-1234567890".getBytes(StandardCharsets.UTF_8)),3600000);
        service=new CalendarLinkService(db,source,new ScheduleFileWriter(new ObjectMapper()),jwt,"https://campthink.cn",clock);
        when(source.read(anyLong(),any())).thenAnswer(call->snapshot(call.getArgument(1),"合成课程",false,false));
    }
    ScheduleExportSource.Snapshot snapshot(ScheduleExportSource.Filter filter,String name,boolean unknown,boolean cancelled){
        var row=new ScheduleExportSource.Row("private-test-row",LocalDate.of(2026,11,2),name,"合成教室","private-teacher","private-group",unknown?null:"08:00",unknown?null:"09:00","第1节",List.of("PERSONAL"),cancelled);
        return new ScheduleExportSource.Snapshot(filter,"本人课程",List.of(row),List.of());
    }
    String token(CalendarLinkService.Link link){return java.net.URI.create(link.url()).getPath().split("/")[3];}
    String read(CalendarLinkService.Link link)throws Exception{return new String(service.read(token(link)).bytes(),StandardCharsets.UTF_8);}
    @Test void privateLinkNeedsAnExplicitEnableAndIsBoundToPersonalStudentScope()throws Exception{
        assertFalse(service.status(1).active());var link=service.enable(1,10);assertTrue(link.active());assertEquals(1,link.count());
        assertEquals(LocalDate.of(2026,11,1),link.from());assertEquals(link.from().plusDays(27),link.to());
        assertTrue(link.expiresAt().isAfter(clock.instant().plus(Duration.ofDays(179))));
        verify(source).read(eq(1L),argThat(f->f.source().equals("PERSONAL")&&f.view().equals("STUDENT")&&f.classId().isEmpty()&&f.reminderMinutes()==10));
        String body=read(link);assertTrue(body.contains("TRIGGER:-PT10M"));assertTrue(body.contains("X-WR-CALNAME:Campthink课表"));
        assertFalse(body.contains("private-teacher"));assertFalse(body.contains("private-group"));assertFalse(body.contains("userId"));
    }
    @Test void reusingAndChangingTheLeadKeepsOneStableGrantAndRebuildsItsData()throws Exception{
        clock.time=Instant.parse("2026-11-01T01:00:00.123456789Z");
        var first=service.enable(1,10);read(first);var changed=service.enable(1,15);
        assertEquals(0,first.expiresAt().getNano());
        assertEquals(first.url(),changed.url());assertEquals(first.expiresAt(),changed.expiresAt());
        assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM account_action_tokens",Integer.class));
        assertTrue(read(changed).contains("TRIGGER:-PT15M"));assertFalse(read(changed).contains("TRIGGER:-PT10M"));
    }
    @Test void signingProofIsNotAValidLoginTokenAndTamperingFailsBeforeDatabaseContent() {
        var link=service.enable(1,10);assertThrows(RuntimeException.class,()->jwt.parseToken(token(link)));
        String valid=token(link),bad=valid.substring(0,valid.length()-1)+(valid.endsWith("A")?"B":"A");
        assertEquals(404,assertThrows(ResponseStatusException.class,()->service.read(bad)).getStatusCode().value());
    }
    @Test void disabledMovedDeletedOrRevokedOwnersCannotBeReadEvenFromTheWarmCache()throws Exception{
        var first=service.enable(1,10);read(first);db.update("UPDATE users SET status=0 WHERE id=1");assertThrows(ResponseStatusException.class,()->read(first));
        db.update("UPDATE users SET status=1,school_id=2 WHERE id=1");assertThrows(ResponseStatusException.class,()->read(first));
        var moved=service.enable(1,10);assertNotEquals(first.url(),moved.url());assertThrows(ResponseStatusException.class,()->read(first));
        read(moved);service.revoke(1);assertThrows(ResponseStatusException.class,()->read(moved));assertFalse(service.status(1).active());
        var deleted=service.enable(1,10);read(deleted);db.update("DELETE FROM users WHERE id=1");assertThrows(ResponseStatusException.class,()->read(deleted));
    }
    @Test void oneAccountCannotRevokeAnotherAndRecoveryNamespacesRemainUntouched()throws Exception{
        db.update("INSERT INTO account_action_tokens(token_hash,user_id,action,pending_email,expires_at) VALUES(?,?,?,?,?)","f".repeat(64),1,"VERIFY_EMAIL","synthetic@example.test",java.sql.Timestamp.from(clock.instant().plusSeconds(600)));
        var owner=service.enable(1,10);service.revoke(2);assertTrue(read(owner).contains("合成课程"));service.revoke(1);
        assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM account_action_tokens WHERE action='VERIFY_EMAIL'",Integer.class));
    }
    @Test void expirationAndRootRotationInvalidateOldAccess()throws Exception{
        var link=service.enable(1,10);read(link);clock.time=link.expiresAt().plusSeconds(1);assertThrows(ResponseStatusException.class,()->read(link));assertFalse(service.status(1).active());
        clock.time=Instant.parse("2026-11-01T01:00:00Z");var changed=new JwtService(Base64.getEncoder().encodeToString("another-synthetic-calendar-root-1234567890".getBytes(StandardCharsets.UTF_8)),3600000);
        var rotated=new CalendarLinkService(db,source,new ScheduleFileWriter(new ObjectMapper()),changed,"https://campthink.cn",clock);
        assertThrows(ResponseStatusException.class,()->rotated.read(token(link)));
    }
    @Test void missingClockAndEmptyOrCancelledOnlyDataCannotEnableAnApparentlyWorkingImport() {
        when(source.read(anyLong(),any())).thenAnswer(call->snapshot(call.getArgument(1),"未核对钟点",true,false));assertThrows(ResponseStatusException.class,()->service.enable(1,10));
        when(source.read(anyLong(),any())).thenAnswer(call->snapshot(call.getArgument(1),"取消课程",false,true));assertThrows(ResponseStatusException.class,()->service.enable(1,10));
        assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM account_action_tokens",Integer.class));
    }
    @Test void changedAndUnknownSourceNeverInventsOrPreservesAnOldTimedAlarm()throws Exception{
        var link=service.enable(1,10);assertTrue(read(link).contains("合成课程"));
        when(source.read(anyLong(),any())).thenAnswer(call->snapshot(call.getArgument(1),"新课程",false,false));clock.time=clock.time.plusSeconds(31);assertTrue(read(link).contains("新课程"));
        when(source.read(anyLong(),any())).thenAnswer(call->snapshot(call.getArgument(1),"待核对课程",true,false));clock.time=clock.time.plusSeconds(31);
        String value=read(link);assertFalse(value.contains("BEGIN:VEVENT"));assertFalse(value.contains("VALARM"));
    }
    @Test void invalidLeadsAndUnsafeCanonicalOriginsFailClosed(){
        for(int lead:List.of(-1,0,6,60))assertThrows(ResponseStatusException.class,()->service.enable(1,lead));
        for(String url:List.of("http://campthink.cn","https://user:secret@campthink.cn","https://campthink.cn?x=1","javascript:alert(1)"))
            assertThrows(IllegalArgumentException.class,()->new CalendarLinkService(db,source,new ScheduleFileWriter(new ObjectMapper()),jwt,url,clock));
    }
    @Test void aSessionRevokedWhileWaitingForTheUserLockCannotIssueReadOrRevokeGrants(){
        assertThrows(ResponseStatusException.class,()->service.enable(1,10,()->false));
        assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM account_action_tokens",Integer.class));
        var link=service.enable(1,10);
        assertThrows(ResponseStatusException.class,()->service.status(1,()->false));
        assertThrows(ResponseStatusException.class,()->service.revoke(1,()->false));
        assertTrue(service.status(1).active());assertNotNull(link.url());
    }
}
