package com.campusai.controller;

import com.campusai.mapper.UserMapper;
import com.campusai.security.AuthSessionService;
import com.campusai.security.JwtService;
import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.boot.SpringApplication;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.*;

/** Read-only business checks after a genuine dump/import. Only fresh synthetic sessions are written. */
@Timeout(90)
@EnabledIfEnvironmentVariable(named="RUN_TEACHING_RESTORE_MYSQL",matches="true")
class TeachingMysqlRestoreDrillTest {
    record Reply(int status,JsonNode body) {}

    @Test void restoredTeachingDataStillEnforcesRealHttpJwtSessionAndHistoricalScopes() throws Exception {
        String schema=System.getenv("RESTORE_TEST_MYSQL_SCHEMA");
        assertTrue(schema!=null&&schema.matches("campthink_restore_20261017_[a-f0-9]{12}"));
        int port=Integer.parseInt(System.getenv("RESTORE_TEST_MYSQL_PORT"));assertTrue(port>=1024&&port<=65535);
        var settings=new HikariConfig();
        settings.setJdbcUrl("jdbc:mysql://127.0.0.1:"+port+"/"+schema+"?serverTimezone=Asia/Shanghai&characterEncoding=utf8&connectTimeout=2000&socketTimeout=6000");
        settings.setUsername(System.getenv("RESTORE_TEST_MYSQL_USER"));settings.setPassword(System.getenv("RESTORE_TEST_MYSQL_PASSWORD"));
        settings.setMaximumPoolSize(4);settings.setMinimumIdle(1);settings.setConnectionTimeout(2000);settings.setPoolName("task-restored-synthetic-only");
        var pool=new HikariDataSource(settings);TeachingMysqlHttpCapacityTest.syntheticPool=pool;
        var db=new JdbcTemplate(pool);db.setQueryTimeout(3);
        ConfigurableApplicationContext context=null;var workers=Executors.newFixedThreadPool(2);long began=System.nanoTime();
        try {
            assertEquals(schema,db.queryForObject("SELECT DATABASE()",String.class));
            assertEquals(10025,db.queryForObject("SELECT COUNT(*) FROM users",Integer.class));
            assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM users WHERE username IS NULL OR username NOT LIKE 'http-demo-%' OR password_hash IS NOT NULL",Integer.class));
            assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM auth_sessions",Integer.class),"old sessions must not survive restoration");
            int attendance=db.queryForObject("SELECT COUNT(*) FROM teaching_attendance",Integer.class);
            int audits=db.queryForObject("SELECT COUNT(*) FROM teaching_attendance_audit",Integer.class);
            var app=new SpringApplication(TeachingMysqlHttpCapacityTest.HttpConfiguration.class);
            context=app.run("--server.address=127.0.0.1","--server.port=0","--spring.sql.init.mode=never","--spring.jdbc.template.query-timeout=3s","--spring.main.banner-mode=off","--spring.threads.virtual.enabled=false","--app.jobs.enabled=false","--app.teaching.requests.enabled=true","--app.teaching.requests.max-in-flight=16");
            String base="http://127.0.0.1:"+context.getEnvironment().getProperty("local.server.port");
            var json=context.getBean(ObjectMapper.class);var sessions=context.getBean(AuthSessionService.class);var users=context.getBean(UserMapper.class);
            Map<Long,String> tokens=new HashMap<>();
            for(long id:List.of(2L,4L,20L,100L,1000L))tokens.put(id,sessions.issue(users.findById(id)).accessToken());
            var client=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).executor(workers).version(HttpClient.Version.HTTP_1_1).build();
            java.util.function.BiFunction<Long,String,Reply> get=(actor,path)->{
                try {
                    var request=HttpRequest.newBuilder(URI.create(base+path)).timeout(Duration.ofSeconds(8)).header("Origin","http://localhost:5173");
                    if(actor>0)request.header("Authorization","Bearer "+tokens.get(actor));
                    var response=client.send(request.GET().build(),HttpResponse.BodyHandlers.ofString());
                    assertEquals("no-store",response.headers().firstValue("Cache-Control").orElse(""));
                    return new Reply(response.statusCode(),response.body().isBlank()?null:json.readTree(response.body()));
                } catch(Exception failure) { throw new IllegalStateException("restored synthetic HTTP read failed",failure); }
            };
            assertEquals(401,get.apply(0L,"/api/teaching/access").status());
            String original=tokens.get(100L);
            tokens.put(100L,context.getBean(JwtService.class).generateToken(users.findById(100L),UUID.randomUUID().toString()));
            assertEquals(401,get.apply(100L,"/api/teaching/access").status(),"a signed token without a restored session is not authorized");
            tokens.put(100L,original);
            var own=get.apply(100L,"/api/timetable/unified/page?view=STUDENT&monday=2026-10-12");
            assertEquals(200,own.status());assertEquals(3,own.body().get("total").asInt());
            assertTrue(own.body().toString().contains("private-100"));assertFalse(own.body().toString().contains("private-101"));
            String large=db.queryForObject("SELECT l.id FROM teaching_lessons l JOIN teaching_courses c ON c.id=l.course_id WHERE c.name='HTTP跨学院702人大合班'",String.class);
            String detail="/api/teaching/lessons/"+large+"/page?size=25&view=";
            var teacher=get.apply(20L,detail+"TEACHER");assertEquals(200,teacher.status());assertEquals(702,teacher.body().get("total").asInt());
            var secretary=get.apply(2L,detail+"SECRETARY");assertEquals(200,secretary.status());assertEquals(400,secretary.body().get("total").asInt());
            var counselor=get.apply(4L,detail+"COUNSELOR");assertEquals(200,counselor.status());assertEquals(100,counselor.body().get("total").asInt());
            assertEquals(403,get.apply(100L,detail+"TEACHER").status());assertEquals(404,get.apply(1000L,detail+"STUDENT").status());
            var full=get.apply(2L,"/api/teaching/lessons/page?view=SECRETARY&from=2026-10-12&to=2026-10-18&size=25");
            assertEquals(200,full.status());assertEquals(51,full.body().get("total").asInt());
            var counts=full.body().get("summary").get("counts");int total=0;
            for(String key:List.of("unknown","onTime","late","absent","excused","earlyLeave"))total+=counts.get(key).asInt();
            assertEquals(5400,total);
            sessions.revokeAccessToken("Bearer "+original);assertEquals(401,get.apply(100L,"/api/teaching/access").status());
            assertEquals(attendance,db.queryForObject("SELECT COUNT(*) FROM teaching_attendance",Integer.class));
            assertEquals(audits,db.queryForObject("SELECT COUNT(*) FROM teaching_attendance_audit",Integer.class));
            assertEquals(5,db.queryForObject("SELECT COUNT(*) FROM auth_sessions",Integer.class));
            var evidence=new LinkedHashMap<String,Object>();evidence.put("schema",schema);evidence.put("actualLoopbackTcpHttp",true);evidence.put("actualJwtAndDbSession",true);
            evidence.put("restoredOldSessions",0);evidence.put("freshSyntheticSessions",5);evidence.put("signedMissingSession401",true);evidence.put("newSessionRevocation401",true);
            evidence.put("ownPrivateAndTeachingItems",3);evidence.put("teacher702Secretary400Counselor100",true);evidence.put("studentCrossView403AndNonmember404",true);
            evidence.put("secretaryCompleteLessons",51);evidence.put("secretaryCompleteCount",5400);evidence.put("attendanceRowsUnchanged",attendance);evidence.put("immutableAuditRowsUnchanged",audits);
            evidence.put("elapsedMillis",(System.nanoTime()-began)/1000000);evidence.put("notPasswordLoginOrSchoolBackupCertification",true);
            Files.writeString(Path.of("../.local/runtime/teaching-mysql-restored-http-2026-10-17.json"),json.writeValueAsString(evidence));
            System.out.println("RESTORED_SYNTHETIC_HTTP "+json.writeValueAsString(evidence));
        } finally {
            if(context!=null)context.close();pool.close();TeachingMysqlHttpCapacityTest.syntheticPool=null;workers.shutdownNow();assertTrue(workers.awaitTermination(5,TimeUnit.SECONDS));
        }
    }
}
