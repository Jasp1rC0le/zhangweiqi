package com.campusai.controller;

import com.campusai.config.WebConfig;
import com.campusai.exception.GlobalExceptionHandler;
import com.campusai.mapper.UserMapper;
import com.campusai.security.*;
import com.campusai.teaching.TeachingService;
import com.campusai.timetable.*;
import com.campusai.user.entity.User;
import com.zaxxer.hikari.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.mybatis.spring.*;
import org.springframework.boot.*;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.annotation.*;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import tools.jackson.databind.*;
import javax.sql.DataSource;
import java.net.*;
import java.net.http.*;
import java.nio.file.*;
import java.sql.Connection;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;

/** Optional real TCP/Tomcat/JWT/DB-session integration. No MockMvc, mock identity or school data. */
@Timeout(180)
@EnabledIfEnvironmentVariable(named="RUN_TEACHING_HTTP_MYSQL",matches="true")
class TeachingMysqlHttpCapacityTest {
    static HikariDataSource syntheticPool;
    static final Clock SCHOOL_CLOCK=Clock.fixed(Instant.parse("2026-10-17T06:02:00Z"),ZoneOffset.UTC);
    @Configuration(proxyBeanMethods=false) @EnableAutoConfiguration @EnableTransactionManagement(proxyTargetClass=true)
    @Import({WebConfig.class,ApiBoundaryFilter.class,JwtInterceptor.class,TeachingRequestGate.class,
            PublicWriteThrottle.class,LoginThrottle.class,GlobalExceptionHandler.class,TeachingController.class,UnifiedTimetableController.class})
    static class HttpConfiguration {
        @Bean DataSource dataSource(){return syntheticPool;}
        @Bean ObjectMapper json(){return new ObjectMapper();}
        @Bean TeachingService teaching(JdbcTemplate db,ObjectMapper json){return new TeachingService(db,json,true,SCHOOL_CLOCK,null,100,1000,0,true,true);}
        @Bean CourseScheduleService personal(JdbcTemplate db,ObjectMapper json){return new CourseScheduleService(db,json);}
        @Bean UnifiedTimetableService unified(JdbcTemplate db,CourseScheduleService personal,TeachingService teaching){return new UnifiedTimetableService(db,personal,teaching,1,SCHOOL_CLOCK);}
        @Bean JwtService jwt(){byte[] bytes=new byte[64];new java.security.SecureRandom().nextBytes(bytes);return new JwtService(Base64.getEncoder().encodeToString(bytes),3600000);}
        @Bean SqlSessionFactoryBean sqlFactory(DataSource ds){var factory=new SqlSessionFactoryBean();factory.setDataSource(ds);var config=new org.apache.ibatis.session.Configuration();config.setMapUnderscoreToCamelCase(true);factory.setConfiguration(config);factory.setMapperLocations(new ClassPathResource("mapper/UserMapper.xml"));return factory;}
        @Bean UserMapper users(org.apache.ibatis.session.SqlSessionFactory factory){return new SqlSessionTemplate(factory).getMapper(UserMapper.class);}
        @Bean AuthSessionService sessions(JdbcTemplate db,UserMapper users,JwtService jwt){return new AuthSessionService(db,users,jwt,30);}
    }
    record Reply(int code,JsonNode body,long millis,Map<String,List<String>> headers) {}
    record Course(String lesson,String student,long teacher,List<TeachingService.Mark> firstPage) {}
    JdbcTemplate db;ObjectMapper json;TeachingService teaching;String base;HttpClient client;
    final Map<Long,String> tokens=new HashMap<>();final List<Course> courses=new ArrayList<>();
    Reply call(long user,String method,String path,Object body)throws Exception{
        var request=HttpRequest.newBuilder(URI.create(base+path)).timeout(Duration.ofSeconds(12)).header("Origin","http://localhost:5173");
        if(user>0)request.header("Authorization","Bearer "+tokens.get(user));
        if(body==null)request.method(method,HttpRequest.BodyPublishers.noBody());
        else request.header("Content-Type","application/json").method(method,HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body)));
        long began=System.nanoTime();var response=client.send(request.build(),HttpResponse.BodyHandlers.ofString());
        assertEquals("no-store",response.headers().firstValue("Cache-Control").orElse(""));
        return new Reply(response.statusCode(),response.body().isBlank()?null:json.readTree(response.body()),(System.nanoTime()-began)/1000000,response.headers().map());
    }
    Reply get(long user,String path)throws Exception{return call(user,"GET",path,null);}
    String lessonPath(String id){return "/api/teaching/lessons/"+id+"/page?view=TEACHER&size=25";}
    void migrate(String file)throws Exception{try(var connection=syntheticPool.getConnection()){org.springframework.jdbc.datasource.init.ScriptUtils.executeSqlScript(connection,new org.springframework.core.io.FileSystemResource(Path.of("../deploy/migrations/"+file)));}}
    void tables()throws Exception{
        db.execute("CREATE TABLE users(id BIGINT PRIMARY KEY,school_id BIGINT NOT NULL,role VARCHAR(20) NOT NULL,status INT NOT NULL,nickname VARCHAR(100),username VARCHAR(100),password_hash VARCHAR(255),created_at DATETIME DEFAULT CURRENT_TIMESTAMP,updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)");
        db.execute("CREATE TABLE auth_sessions(id CHAR(36) PRIMARY KEY,user_id BIGINT NOT NULL,refresh_hash CHAR(64) NOT NULL UNIQUE,expires_at DATETIME NOT NULL,revoked_at DATETIME NULL,created_at DATETIME DEFAULT CURRENT_TIMESTAMP,INDEX session_user(user_id,revoked_at),FOREIGN KEY(user_id) REFERENCES users(id))");
        for(String file:List.of("2026-10-14-teaching-attendance.sql","2026-10-15-teaching-rosters.sql","2026-10-15-teaching-lifecycle.sql","2026-10-17-teaching-reenrollment.sql","2026-10-17-teaching-course-mode-reviews.sql","2026-10-15-teaching-capacity-indexes.sql","2026-10-17-teaching-roster-query-index.sql"))migrate(file);
        db.execute("CREATE TABLE student_course_schedule_versions(user_id BIGINT PRIMARY KEY,revision INT NOT NULL)");
        db.execute("CREATE TABLE student_timetables(user_id BIGINT PRIMARY KEY)");
        db.execute("CREATE TABLE student_course_schedules(user_id BIGINT PRIMARY KEY,revision INT,semester VARCHAR(100),first_monday DATE,remind_days INT,courses_json TEXT,imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)");
        List<Object[]> users=new ArrayList<>();for(long id:List.of(1L,2L,3L,4L,5L))users.add(new Object[]{id,id==5?2:1,id==1?"ADMIN":"STUDENT",1,"合成操作账号"+id,"http-demo-"+id});
        for(long id=20;id<40;id++)users.add(new Object[]{id,1,"STUDENT",1,"合成教师"+id,"http-demo-"+id});
        for(long id=100;id<10100;id++)users.add(new Object[]{id,1,"STUDENT",1,"合成学生"+id,"http-demo-"+id});
        db.batchUpdate("INSERT INTO users(id,school_id,role,status,nickname,username) VALUES(?,?,?,?,?,?)",users);
    }
    void seed()throws Exception{
        List<String> allStudents=new ArrayList<>();List<String> classes=new ArrayList<>();
        for(int c=0;c<100;c++){
            String cls=UUID.randomUUID().toString();classes.add(cls);List<TeachingService.Member> members=new ArrayList<>();
            for(int n=0;n<100;n++){long user=100L+c*100L+n;members.add(new TeachingService.Member("http-synthetic-"+user,"合成同学"+user,user));}
            teaching.createClass(1,new TeachingService.ClassInput(cls,c%2==0?"合成学院甲":"合成学院乙","HTTP合成班"+c,members));
            var roster=teaching.members(1,cls);allStudents.addAll(roster.stream().map(s->s.id()).toList());
            long teacher=20+c/5;String id=UUID.randomUUID().toString();teaching.createCourse(1,new TeachingService.CourseInput(id,cls,teacher,"HTTP合成课程"+c,"合成学期",LocalDate.of(2026,10,12),c%5+1,"08:30","10:05",List.of(1),"合成教室"+c));
            String lesson=db.queryForObject("SELECT id FROM teaching_lessons WHERE course_id=?",String.class,id);
            var page=teaching.detailPage(teacher,"TEACHER",lesson,0,25,"");courses.add(new Course(lesson,roster.get(0).id(),teacher,page.detail().entries().stream().map(e->new TeachingService.Mark(e.studentId(),"ON_TIME")).toList()));
        }
        teaching.grant(1,new TeachingService.GrantInput(2L,"SECRETARY","合成学院甲"),false);teaching.grant(1,new TeachingService.GrantInput(3L,"SECRETARY","合成学院乙"),false);teaching.grant(1,new TeachingService.GrantInput(4L,"COUNSELOR",classes.get(0)),false);
        String large=UUID.randomUUID().toString();var input=new TeachingService.CourseInput(large,classes.get(0),20L,"HTTP跨学院702人大合班","合成学期",LocalDate.of(2026,10,12),6,"14:00","15:35",List.of(1),"合成大教室");
        teaching.createRosterCourse(1,new TeachingService.RosterCourseInput(input,"HTTP跨学院教学组",List.copyOf(allStudents.subList(0,702))));
        String lesson=db.queryForObject("SELECT id FROM teaching_lessons WHERE course_id=?",String.class,large);courses.add(new Course(lesson,allStudents.get(0),20,List.of()));
        for(long user=100;user<200;user++){
            db.update("INSERT INTO student_course_schedule_versions VALUES(?,1)",user);
            db.update("INSERT INTO student_course_schedules(user_id,revision,semester,first_monday,remind_days,courses_json) VALUES(?,1,'合成私人学期','2026-10-12',7,?)",user,"[{\"name\":\"private-"+user+"\",\"weekday\":7,\"startTime\":\"08:30\",\"endTime\":\"09:15\",\"weeks\":[1],\"room\":\"private-room\"}]");
        }
        assertEquals(10000,db.queryForObject("SELECT COUNT(*) FROM teaching_students",Integer.class));assertEquals(10702,db.queryForObject("SELECT COUNT(*) FROM teaching_attendance",Integer.class));
    }
    List<Map<String,Object>> load()throws Exception{
        List<Map<String,Object>> tiers=new ArrayList<>();
        for(int tier=0;tier<3;tier++){
            int concurrency=new int[]{4,12,24}[tier],round=tier;var workers=Executors.newFixedThreadPool(concurrency);List<Future<Map<String,Object>>> jobs=new ArrayList<>();long began=System.nanoTime();
            try{
                for(int i=0;i<120;i++){int n=i;jobs.add(workers.submit(()->{
                    boolean write=n%6==0;Reply reply;Course target=null;
                    if(write){target=courses.get((n/6)*5+round);reply=call(target.teacher(),"PUT","/api/teaching/lessons/"+target.lesson()+"/attendance/page?size=25",new TeachingService.RollCall(0,target.firstPage(),"",false));}
                    else if(n%10==0)reply=get(2,"/api/teaching/lessons/page?view=SECRETARY&from=2026-10-12&to=2026-10-18&size=25");
                    else if(n%3==0)reply=get(20+n%20,"/api/teaching/lessons/page?view=TEACHER&from=2026-10-12&to=2026-10-18&size=25");
                    else reply=get(100+(n*97)%10000,"/api/timetable/unified/page?view=STUDENT&monday=2026-10-12&size=25");
                    System.out.println("HTTP_SAMPLE tier="+concurrency+" n="+n+" write="+write+" status="+reply.code()+" millis="+reply.millis());
                    assertTrue(Set.of(200,429,503).contains(reply.code()),"unexpected HTTP "+reply.code());
                    if(reply.code()==200)assertNotNull(reply.body());
                    if(reply.code()==429||reply.headers().containsKey("retry-after"))assertEquals(List.of("2"),reply.headers().get("retry-after"));
                    boolean unknown=reply.code()==503&&reply.body()!=null&&reply.body().get("message")!=null&&reply.body().get("message").asString().contains("结果尚未确认");
                    return Map.of("status",reply.code(),"millis",reply.millis(),"write",write,"lesson",write?target.lesson():"","unknownWriteResult",unknown);
                }));}
                List<Long> successTimes=new ArrayList<>(),allTimes=new ArrayList<>();Map<Integer,Integer> statuses=new TreeMap<>();Map<String,Map<String,Object>> writes=new LinkedHashMap<>();int acceptedWrites=0,unknownWrites=0;
                for(var job:jobs){var r=job.get(18,TimeUnit.SECONDS);int code=(Integer)r.get("status");long ms=(Long)r.get("millis");statuses.merge(code,1,Integer::sum);allTimes.add(ms);if(Boolean.TRUE.equals(r.get("write")))writes.put((String)r.get("lesson"),r);if(code==200){successTimes.add(ms);if(Boolean.TRUE.equals(r.get("write")))acceptedWrites++;}}
                // Inspect effects only after this HTTP wave drains. Extra direct
                // verification connections must not compete with the app pool.
                for(var write:writes.entrySet()){
                    int audit=db.queryForObject("SELECT COUNT(*) FROM teaching_attendance_audit WHERE lesson_id=?",Integer.class,write.getKey());
                    if(Boolean.TRUE.equals(write.getValue().get("unknownWriteResult"))){unknownWrites++;assertTrue(audit==0||audit==25,"an unknown transport result must still have an atomic effect");}
                    else assertEquals(((Integer)write.getValue().get("status"))==200?25:0,audit);
                    assertEquals(audit==25?1:0,db.queryForObject("SELECT revision FROM teaching_lessons WHERE id=?",Integer.class,write.getKey()));
                }
                assertTrue(statuses.getOrDefault(200,0)>0);Collections.sort(successTimes);Collections.sort(allTimes);
                var result=Map.<String,Object>of("workers",concurrency,"requests",120,"statuses",statuses,"acceptedWrites",acceptedWrites,"unknownWriteResultsReadBackNotRetried",unknownWrites,"acceptedP95Millis",successTimes.get(Math.min(successTimes.size()-1,(int)Math.ceil(successTimes.size()*.95)-1)),"allP95Millis",allTimes.get((int)Math.ceil(allTimes.size()*.95)-1),"elapsedMillis",(System.nanoTime()-began)/1000000);tiers.add(result);System.out.println("HTTP_TIER "+json.writeValueAsString(result));
                assertTrue(((Long)result.get("allP95Millis"))<3000,"local synthetic mixed-wave p95 must stay below the 3s query budget; not a production SLA");
            }finally{workers.shutdownNow();assertTrue(workers.awaitTermination(5,TimeUnit.SECONDS));}
        }
        return tiers;
    }
    @Test void realLoopbackHttpMixedReadWriteAuthRevocationConflictAndRecovery()throws Exception{
        String schema=System.getenv("HTTP_TEST_MYSQL_SCHEMA");assertTrue(schema!=null&&schema.matches("campthink_http_20261017_[a-f0-9]{12}"));int dbPort=Integer.parseInt(System.getenv("HTTP_TEST_MYSQL_PORT"));assertTrue(dbPort>=1024&&dbPort<=65535);
        var config=new HikariConfig();config.setJdbcUrl("jdbc:mysql://127.0.0.1:"+dbPort+"/"+schema+"?serverTimezone=Asia/Shanghai&characterEncoding=utf8&rewriteBatchedStatements=true&connectTimeout=2000&socketTimeout=6000");config.setUsername(System.getenv("HTTP_TEST_MYSQL_USER"));config.setPassword(System.getenv("HTTP_TEST_MYSQL_PASSWORD"));config.setMaximumPoolSize(8);config.setMinimumIdle(2);config.setConnectionTimeout(2000);config.setValidationTimeout(1000);config.setPoolName("task-http-synthetic-only");
        syntheticPool=new HikariDataSource(config);db=new JdbcTemplate(syntheticPool);db.setQueryTimeout(3);var app=new SpringApplication(HttpConfiguration.class);app.setDefaultProperties(Map.of("server.address","127.0.0.1","server.port","0","spring.sql.init.mode","never","spring.main.banner-mode","off","server.tomcat.threads.max","64","server.tomcat.max-connections","256","spring.threads.virtual.enabled","false","app.jobs.enabled","false"));
        ConfigurableApplicationContext context=null;var httpWorkers=Executors.newFixedThreadPool(12);long began=System.nanoTime();
        try{
            tables();
            context=app.run("--server.address=127.0.0.1","--server.port=0","--spring.sql.init.mode=never","--spring.jdbc.template.query-timeout=3s","--spring.main.banner-mode=off","--server.tomcat.threads.max=64","--server.tomcat.max-connections=256","--spring.threads.virtual.enabled=false","--app.jobs.enabled=false","--app.teaching.requests.enabled=true","--app.teaching.requests.max-in-flight=16");base="http://127.0.0.1:"+context.getEnvironment().getProperty("local.server.port");assertFalse(base.endsWith("null"));json=context.getBean(ObjectMapper.class);teaching=context.getBean(TeachingService.class);seed();client=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).executor(httpWorkers).version(HttpClient.Version.HTTP_1_1).build();
            var sessions=context.getBean(AuthSessionService.class);var users=context.getBean(UserMapper.class);for(long id:List.of(1L,2L,3L,4L,5L))tokens.put(id,sessions.issue(users.findById(id)).accessToken());for(long id=20;id<40;id++)tokens.put(id,sessions.issue(users.findById(id)).accessToken());for(long id=100;id<10100;id++)if(id<200||((id-100)%97==0))tokens.put(id,sessions.issue(users.findById(id)).accessToken());
            // Add exactly the dispersed synthetic readers; no real login token is read or written.
            for(int n=0;n<120;n++){long id=100+(n*97)%10000;if(!tokens.containsKey(id))tokens.put(id,sessions.issue(users.findById(id)).accessToken());}
            tokens.put(1000L,sessions.issue(users.findById(1000L)).accessToken());
            assertEquals(401,get(0,"/api/teaching/access").code());assertEquals(403,get(100,"/api/teaching/lessons/page?view=TEACHER&from=2026-10-12&to=2026-10-18").code());assertEquals(403,get(5,"/api/teaching/lessons/page?view=TEACHER&from=2026-10-12&to=2026-10-18").code());
            String valid=tokens.get(1000L);try{tokens.put(1000L,valid+"x");assertEquals(401,get(1000,"/api/teaching/access").code());}finally{tokens.put(1000L,valid);}
            var own=get(100,"/api/timetable/unified/page?view=STUDENT&monday=2026-10-12");assertEquals(200,own.code());assertEquals(3,own.body().get("total").asInt());assertTrue(own.body().toString().contains("private-100"));assertFalse(own.body().toString().contains("private-101"));
            String large=courses.get(100).lesson();var all=new HashSet<String>();for(int p=0;p<8;p++){var r=get(20,"/api/teaching/lessons/"+large+"/page?view=TEACHER&size=100&page="+p);assertEquals(200,r.code());assertEquals(702,r.body().get("total").asInt());for(var e:r.body().get("detail").get("entries"))assertTrue(all.add(e.get("studentId").asString()));}assertEquals(702,all.size());
            var leader=get(2,"/api/teaching/lessons/"+large+"/page?view=SECRETARY&size=25");assertEquals(400,leader.body().get("total").asInt());assertEquals(1,get(100,"/api/teaching/lessons/"+large+"/page?view=STUDENT").body().get("total").asInt());assertEquals(404,get(1000,"/api/teaching/lessons/"+large+"/page?view=STUDENT").code());
            var leaderLessons=new HashSet<String>();for(int p=0;p<3;p++){var r=get(2,"/api/teaching/lessons/page?view=SECRETARY&from=2026-10-12&to=2026-10-18&size=25&page="+p);assertEquals(200,r.code());assertEquals(51,r.body().get("total").asInt());assertEquals(5400,r.body().get("summary").get("counts").get("unknown").asInt());for(var row:r.body().get("items"))assertTrue(leaderLessons.add(row.get("id").asString()));}assertEquals(51,leaderLessons.size());
            for(long actor:List.of(197L,294L,391L,488L,585L,20L,21L,2L,3L)){
                String path=actor<20?"/api/teaching/lessons/page?view=SECRETARY&from=2026-10-12&to=2026-10-18&size=25":actor<100?"/api/teaching/lessons/page?view=TEACHER&from=2026-10-12&to=2026-10-18&size=25":"/api/timetable/unified/page?view=STUDENT&monday=2026-10-12&size=25";
                var sample=get(actor,path);System.out.println("HTTP_PREFLIGHT actor="+actor+" status="+sample.code()+" millis="+sample.millis());assertEquals(200,sample.code());
            }
            var tiers=load();
            Course conflict=courses.get(4);var write=new TeachingService.RollCall(0,conflict.firstPage(),"",false);assertEquals(200,call(conflict.teacher(),"PUT","/api/teaching/lessons/"+conflict.lesson()+"/attendance/page?size=25",write).code());assertEquals(409,call(conflict.teacher(),"PUT","/api/teaching/lessons/"+conflict.lesson()+"/attendance/page?size=25",write).code());assertEquals(25,db.queryForObject("SELECT COUNT(*) FROM teaching_attendance_audit WHERE lesson_id=?",Integer.class,conflict.lesson()));
            boolean limited=false;for(int i=0;i<40;i++){var r=get(101,"/api/teaching/access");if(r.code()==429){limited=true;break;}assertEquals(200,r.code());}assertTrue(limited);
            List<Connection> held=new ArrayList<>();int unavailable;try{for(int n=0;n<8;n++)held.add(syntheticPool.getConnection());unavailable=get(102,"/api/teaching/access").code();assertEquals(503,unavailable);}finally{for(var connection:held)connection.close();}assertEquals(200,get(102,"/api/teaching/access").code());
            sessions.revokeAccessToken("Bearer "+tokens.get(103L));assertEquals(401,get(103,"/api/teaching/access").code());assertEquals(200,get(104,"/api/teaching/access").code());
            var evidence=new LinkedHashMap<String,Object>();evidence.put("environment","real loopback Tomcat HTTP, native synthetic MySQL, actual JWT and auth_sessions lookup");evidence.put("schema",schema);evidence.put("databaseVersion",db.queryForObject("SELECT VERSION()",String.class));evidence.put("schoolSchemaTargeted",false);evidence.put("registeredUsers",db.queryForObject("SELECT COUNT(*) FROM users",Integer.class));evidence.put("students",10000);evidence.put("normalCourses",100);evidence.put("crossCollegeRoster",702);evidence.put("actualPoolMaximum",syntheticPool.getMaximumPoolSize());evidence.put("activeProcessorCount",Runtime.getRuntime().availableProcessors());evidence.put("maxHeapBytes",Runtime.getRuntime().maxMemory());evidence.put("requestGateInFlightLimit",16);evidence.put("mixedHttpTiers",tiers);evidence.put("largeRosterEveryPageDistinct",all.size());evidence.put("secretaryLargeRosterWithinOwnCollege",400);evidence.put("secretary51LessonsThreePages5400ScopedRows",leaderLessons.size()==51);evidence.put("privateAndTeachingOwnWeekTotal",3);evidence.put("staleWrite409NoDuplicateAudit",true);evidence.put("accountBurst429",true);evidence.put("poolExhaustion503AndRecovery",unavailable==503);evidence.put("revokedSession401",true);evidence.put("invalidJwt401",true);evidence.put("studentAndOtherSchoolAuthorizationEnforced",true);evidence.put("acceptedWriteEffectsAndGateRejectedNoEffectsChecked",true);evidence.put("unknownWriteResultsReadBackWithoutAutomaticReplay",true);evidence.put("elapsedMillis",(System.nanoTime()-began)/1000000);evidence.put("notProductionHardwareCertificate",true);evidence.put("notPublicNetworkOrBackupTest",true);Path path=Path.of("../.local/runtime/teaching-mysql-http-2026-10-17.json");Files.writeString(path,json.writeValueAsString(evidence));System.out.println("MYSQL_HTTP_CAPACITY "+json.writeValueAsString(evidence));
        }finally{if(context!=null)context.close();syntheticPool.close();httpWorkers.shutdownNow();assertTrue(httpWorkers.awaitTermination(5,TimeUnit.SECONDS));}
    }
}
