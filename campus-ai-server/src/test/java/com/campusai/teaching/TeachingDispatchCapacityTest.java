package com.campusai.teaching;

import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.ObjectMapper;
import java.lang.reflect.*;
import java.nio.file.*;
import java.sql.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import static org.junit.jupiter.api.Assertions.*;

@Timeout(40)
class TeachingDispatchCapacityTest {
    JdbcTemplate db; TeachingService service; TransactionTemplate tx;
    final Instant start=Instant.parse("2026-10-15T00:30:00Z");
    final AtomicInteger reads=new AtomicInteger(),writes=new AtomicInteger();
    class CountedDataSource extends DelegatingDataSource {
        CountedDataSource(javax.sql.DataSource source){super(source);}
        @Override public Connection getConnection() throws SQLException {
            Connection connection=super.getConnection();
            return (Connection)Proxy.newProxyInstance(getClass().getClassLoader(),new Class[]{Connection.class},(proxy,method,args)->{
                Object result=invoke(connection,method,args);
                if(method.getName().equals("prepareStatement")) {
                    PreparedStatement statement=(PreparedStatement)result;
                    return Proxy.newProxyInstance(getClass().getClassLoader(),new Class[]{PreparedStatement.class},(p,m,a)->{
                        if(m.getName().equals("executeQuery"))reads.incrementAndGet();
                        if(m.getName().equals("executeUpdate"))writes.incrementAndGet();
                        return invoke(statement,m,a);
                    });
                }
                return result;
            });
        }
    }
    static Object invoke(Object target,Method method,Object[] args) throws Throwable {
        try{return method.invoke(target,args);}catch(InvocationTargetException e){throw e.getCause();}
    }
    @BeforeEach void seed() throws Exception {
        var raw=new DriverManagerDataSource("jdbc:h2:mem:dispatch-capacity-"+UUID.randomUUID()+";MODE=MySQL;DB_CLOSE_DELAY=-1","sa","");
        seed(raw);
    }
    void seed(javax.sql.DataSource raw) throws Exception {
        var seed=new JdbcTemplate(raw);
        seed.execute("CREATE TABLE users(id BIGINT PRIMARY KEY,school_id BIGINT,role VARCHAR(16),status INT,nickname VARCHAR(100),username VARCHAR(100))");
        for(String sql:Files.readString(Path.of("../deploy/migrations/2026-10-14-teaching-attendance.sql")).split(";"))if(!sql.isBlank())seed.execute(sql);
        List<Object[]> users=new ArrayList<>();for(int i=1;i<=10002;i++)users.add(new Object[]{i,1,i==1?"ADMIN":"STUDENT",1,"synthetic-user-"+i,"synthetic-"+i});
        seed.batchUpdate("INSERT INTO users VALUES(?,?,?,?,?,?)",users);
        List<Object[]> classes=new ArrayList<>(),students=new ArrayList<>(),courses=new ArrayList<>(),lessons=new ArrayList<>(),attendance=new ArrayList<>();
        for(int c=0;c<250;c++) {
            String clazz=UUID.nameUUIDFromBytes(("synthetic-class-"+c).getBytes()).toString(),course=UUID.randomUUID().toString(),lesson=UUID.randomUUID().toString();
            classes.add(new Object[]{clazz,1,"合成容量学院","合成班"+c,"synthetic-class-"+c});
            courses.add(new Object[]{course,1,clazz,10002,"合成压力课程","合成学期",java.sql.Date.valueOf("2026-10-12"),4,"08:30","09:15","[1]","合成教室","synthetic-course-"+c});
            lessons.add(new Object[]{lesson,1,course,clazz,Timestamp.from(start),Timestamp.from(start.plusSeconds(2700))});
            for(int i=0;i<40;i++) {int user=2+c*40+i;String student=UUID.randomUUID().toString();students.add(new Object[]{student,1,clazz,"synthetic-number-"+user,"synthetic-student-"+user,user});attendance.add(new Object[]{lesson,student,"synthetic-number-"+user,"synthetic-student-"+user});}
        }
        seed.batchUpdate("INSERT INTO teaching_classes VALUES(?,?,?,?,?)",classes);
        seed.batchUpdate("INSERT INTO teaching_students VALUES(?,?,?,?,?,?)",students);
        seed.batchUpdate("INSERT INTO teaching_courses VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",courses);
        seed.batchUpdate("INSERT INTO teaching_lessons(id,school_id,course_id,class_id,starts_at,ends_at) VALUES(?,?,?,?,?,?)",lessons);
        seed.batchUpdate("INSERT INTO teaching_attendance(lesson_id,student_id,student_number,student_name) VALUES(?,?,?,?)",attendance);
        var counted=new CountedDataSource(raw);db=new JdbcTemplate(counted);tx=new TransactionTemplate(new DataSourceTransactionManager(counted));
        service=new TeachingService(db,new ObjectMapper(),true,Clock.fixed(start.minusSeconds(300),ZoneOffset.UTC));
    }
    @Test void firstPassIsMeasuredAndBounded() throws Exception {
        long begun=System.nanoTime();int added=tx.execute(s->service.dispatchDueNotices());long millis=(System.nanoTime()-begun)/1000000;
        boolean before="before".equals(System.getProperty("capacity.phase"));
        var metrics=Map.of("engine","isolated H2","registeredStudents",10000,"lessons",250,"added",added,"readStatements",reads.get(),"writeStatements",writes.get(),"elapsedMillis",millis);
        Path output=Path.of("target/test-evidence/dispatch-capacity-"+(before?"before":"after")+".json");Files.createDirectories(output.getParent());Files.writeString(output,new ObjectMapper().writeValueAsString(metrics));
        System.out.println("DISPATCH_CAPACITY "+new ObjectMapper().writeValueAsString(metrics));
        assertEquals(before?10250:1000,added);
        if(!before) {assertTrue(reads.get()<=3);assertTrue(writes.get()<=10);}
    }
    @Test void boundedPassesDrainAllRecipientsWithoutStarvationOrDuplicates() throws Exception {
        long begun=System.nanoTime();int total=0,passes=0;
        while(passes++<12){int added=tx.execute(s->service.dispatchDueNotices());assertTrue(added<=1000);total+=added;if(added==0)break;}
        assertEquals(10250,total);assertEquals(10250,db.queryForObject("SELECT COUNT(*) FROM teaching_notices",Integer.class));
        assertEquals(10000,db.queryForObject("SELECT COUNT(*) FROM teaching_notices WHERE kind='STUDENT_CLASS'",Integer.class));
        var metrics=Map.of("engine","isolated H2","total",total,"passes",passes,"readStatements",reads.get(),"writeStatements",writes.get(),"elapsedMillis",(System.nanoTime()-begun)/1000000);
        Path output=Path.of("target/test-evidence/dispatch-capacity-drain.json");Files.createDirectories(output.getParent());Files.writeString(output,new ObjectMapper().writeValueAsString(metrics));
        assertTrue(writes.get()<=103);assertTrue(reads.get()<=36);
    }
    @Test void preparationNeverMakesAnInboxVisibleBeforeItsDueTimeAndExpiredLessonsAreNotSent() {
        var mutable=new Clock(){Instant value=start.minusSeconds(4200);public ZoneId getZone(){return ZoneOffset.UTC;}public Clock withZone(ZoneId zone){return this;}public Instant instant(){return value;}};
        var prepared=new TeachingService(db,new ObjectMapper(),true,mutable,null,100,1000,900);
        int preparedCount=tx.execute(s->prepared.dispatchDueNotices());assertEquals(1000,preparedCount);long recipient=db.queryForObject("SELECT user_id FROM teaching_notices LIMIT 1",Long.class);assertTrue(prepared.notices(recipient).isEmpty());assertTrue(prepared.notices(10002).isEmpty());
        mutable.value=start.minusSeconds(3600);assertFalse(prepared.notices(recipient).isEmpty());assertTrue(prepared.notices(10002).isEmpty());
        mutable.value=start;int expiredCount=tx.execute(s->prepared.dispatchDueNotices());assertEquals(0,expiredCount);
    }
    @Test void laterBatchFailureRollsBackEarlierWritesInsteadOfLeavingAPartialReceipt() {
        db.execute("ALTER TABLE teaching_notices ADD CONSTRAINT synthetic_notice_failure CHECK(kind<>'STUDENT_CLASS')");
        assertThrows(Exception.class,()->tx.execute(s->service.dispatchDueNotices()));assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM teaching_notices",Integer.class));
    }
}
