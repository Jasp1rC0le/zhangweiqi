package com.campusai.teaching;

import com.zaxxer.hikari.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.TransactionDefinition;
import tools.jackson.databind.ObjectMapper;
import java.nio.file.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;

@Timeout(90)
@EnabledIfEnvironmentVariable(named="RUN_TEACHING_CAPACITY_MYSQL",matches="true")
class TeachingMysqlCapacityTest {
    @Test void isolatedMysqlSyntheticLoadAndIndexPlans() throws Exception {
        String schema=System.getenv("CAPACITY_TEST_MYSQL_SCHEMA");assertTrue(schema!=null && schema.matches("campthink_capacity_20261015_[a-f0-9]{12}"));
        int port=Integer.parseInt(System.getenv("CAPACITY_TEST_MYSQL_PORT"));assertTrue(port>=1024 && port<=65535);
        var config=new HikariConfig();config.setJdbcUrl("jdbc:mysql://127.0.0.1:"+port+"/"+schema+"?serverTimezone=Asia/Shanghai&useUnicode=true&characterEncoding=utf8&rewriteBatchedStatements=true&connectTimeout=2000&socketTimeout=5000");
        config.setUsername(System.getenv("CAPACITY_TEST_MYSQL_USER"));config.setPassword(System.getenv("CAPACITY_TEST_MYSQL_PASSWORD"));config.setMaximumPoolSize(4);config.setMinimumIdle(1);config.setConnectionTimeout(2000);config.setValidationTimeout(1000);config.setPoolName("task-capacity-only");
        try(var pool=new HikariDataSource(config)) {
            var fixture=new TeachingDispatchCapacityTest();fixture.seed(pool);fixture.db.setQueryTimeout(3);
            for(String sql:Files.readString(Path.of("../deploy/migrations/2026-10-15-teaching-capacity-indexes.sql")).split(";"))if(!sql.isBlank())fixture.db.execute(sql);
            fixture.db.update("INSERT INTO teaching_grants VALUES(?,?,?,?)",1,1,"SECRETARY","合成容量学院");
            var plan=fixture.db.queryForList("EXPLAIN SELECT id FROM teaching_lessons WHERE school_id=1 AND class_id=? AND cancelled=FALSE AND starts_at<? AND ends_at>?",fixture.db.queryForObject("SELECT id FROM teaching_classes LIMIT 1",String.class),java.sql.Timestamp.from(fixture.start.plusSeconds(2700)),java.sql.Timestamp.from(fixture.start));
            assertTrue(plan.stream().anyMatch(row->"teaching_class_overlap".equals(row.get("key"))));
            fixture.service.lessonPage(1,"SECRETARY",LocalDate.of(2026,10,12),LocalDate.of(2026,10,18),null,0,50);
            List<Map<String,Object>> tiers=new ArrayList<>();
            for(int concurrency:new int[]{5,10,25,50}) {
                var workers=Executors.newFixedThreadPool(concurrency);List<Future<Long>> jobs=new ArrayList<>();long began=System.nanoTime();
                try {
                    for(int i=0;i<100;i++)jobs.add(workers.submit(()->{
                        long time=System.nanoTime();var tx=new TransactionTemplate(fixture.tx.getTransactionManager());tx.setReadOnly(true);tx.setIsolationLevel(TransactionDefinition.ISOLATION_REPEATABLE_READ);tx.setTimeout(8);
                        var page=tx.execute(s->fixture.service.lessonPage(1,"SECRETARY",LocalDate.of(2026,10,12),LocalDate.of(2026,10,18),null,0,50));
                        assertEquals(250,page.total());assertEquals(10000,page.summary().counts().unknown());assertEquals(50,page.items().size());return (System.nanoTime()-time)/1000000;
                    }));
                    List<Long> times=new ArrayList<>();int failures=0;for(var job:jobs){try{times.add(job.get(12,TimeUnit.SECONDS));}catch(ExecutionException e){failures++;}}
                    Collections.sort(times);tiers.add(Map.of("workers",concurrency,"requested",100,"succeeded",times.size(),"failed",failures,"elapsedMillis",(System.nanoTime()-began)/1000000,"p95Millis",times.isEmpty()?0:times.get(Math.min(times.size()-1,(int)Math.ceil(times.size()*0.95)-1))));
                } finally {workers.shutdownNow();assertTrue(workers.awaitTermination(3,TimeUnit.SECONDS));}
            }
            long began=System.nanoTime();int first=fixture.tx.execute(s->fixture.service.dispatchDueNotices());assertEquals(1000,first);int total=first,passes=1;
            while(passes++<12){int added=fixture.tx.execute(s->fixture.service.dispatchDueNotices());assertTrue(added<=1000);total+=added;if(added==0)break;}assertEquals(10250,total);
            var evidence=Map.of("engine","local isolated MySQL","schema",schema,"registeredStudents",10000,"lessonCount",250,"poolConnections",4,"indexedOverlapPlan",true,"readTiers",tiers,"noticeRows",total,"dispatchElapsedMillis",(System.nanoTime()-began)/1000000);
            Path output=Path.of("../.local/runtime/teaching-mysql-capacity-2026-10-15.json");Files.createDirectories(output.getParent());Files.writeString(output,new ObjectMapper().writeValueAsString(evidence));
            System.out.println("MYSQL_CAPACITY "+new ObjectMapper().writeValueAsString(evidence));
        }
    }
}
