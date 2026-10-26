package com.campusai.controller;

import com.campusai.teaching.*;
import com.zaxxer.hikari.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import java.nio.file.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

@Timeout(100) @EnabledIfEnvironmentVariable(named="RUN_CHANGE_NOTICE_MYSQL",matches="true")
class TeachingMysqlChangeNoticeTest {
    @Test void currentRecipientsReadStateAndCompleteNoticeBatchesOnNativeMysql()throws Exception{
        String schema=System.getenv("CHANGE_NOTICE_MYSQL_SCHEMA");assertTrue(schema!=null&&schema.matches("campthink_change_notice_20261018_[a-f0-9]{12}"));int port=Integer.parseInt(System.getenv("CHANGE_NOTICE_MYSQL_PORT"));assertTrue(port>=1024&&port<=65535);
        var cfg=new HikariConfig();cfg.setJdbcUrl("jdbc:mysql://127.0.0.1:"+port+"/"+schema+"?serverTimezone=Asia/Shanghai&characterEncoding=utf8&connectTimeout=2000&socketTimeout=8000");cfg.setUsername(System.getenv("CHANGE_NOTICE_MYSQL_USER"));cfg.setPassword(System.getenv("CHANGE_NOTICE_MYSQL_PASSWORD"));cfg.setMaximumPoolSize(4);cfg.setMinimumIdle(1);cfg.setConnectionTimeout(2000);cfg.setPoolName("task-change-notices-only");
        try(var pool=new HikariDataSource(cfg)){
            var flow=new TeachingLessonChangeNoticeTest();flow.syntheticDataSource=pool;long started=System.nanoTime();
            try{
                flow.setup();flow.f.db.setQueryTimeout(5);flow.actualRecipientsAreSelectedStudentsAndReviewedTeachersNeverLeadersOrUnselectedClassmates();
                var original=flow.single(2);var read=flow.notices.markRead(2,original.id());assertNotNull(read.readAt());assertEquals(read.readAt(),flow.notices.markRead(2,original.id()).readAt());assertEquals(0,flow.notices.page(2,true,0,25).total());assertEquals(1,flow.notices.page(2,false,0,25).total());
                flow.oneHundredAndOneActualRecipientsUseCompleteBatchedInsertionWithoutMakingTheClassPublic();assertEquals(107,flow.f.db.queryForObject("SELECT COUNT(*) FROM teaching_notices WHERE kind LIKE 'LESSON_CHANGE%'",Integer.class));
                var application=flow.flow.identities.mine(10).items().get(0);flow.flow.identities.review(1,application.id(),new TeachingIdentityService.Review(application.revision(),"REVOKE","原生模拟撤销教师身份"));assertEquals(0,flow.notices.page(10,false,0,25).total());
                var evidence=new LinkedHashMap<String,Object>();evidence.put("engine",flow.f.db.queryForObject("SELECT VERSION()",String.class));evidence.put("schema",schema);evidence.put("schoolDataTargeted",false);evidence.put("firstChangeRecipients",4);evidence.put("actualLargeCourseStudents",101);evidence.put("largeChangeRecipients",103);evidence.put("allStoredChangeNotices",107);evidence.put("recipientBatchSize",100);evidence.put("teacherReleasedHasNoReplacementMetadata",true);evidence.put("unselectedClassmatesAndLeadersExcluded",true);evidence.put("privateAdminReasonExcludedFromDto",true);evidence.put("readStateIdempotentAndRetained",true);evidence.put("currentTeacherIdentityRevocationHidesInbox",true);evidence.put("authenticationBoundary","signed synthetic MockMvc session registry, not real school login HTTP or production hardware");evidence.put("elapsedMillis",(System.nanoTime()-started)/1000000);
                var output=Path.of("../.local/runtime/teaching-mysql-change-notices-2026-10-18.json");Files.createDirectories(output.getParent());Files.writeString(output,flow.f.json.writeValueAsString(evidence));System.out.println("MYSQL_CHANGE_NOTICES "+flow.f.json.writeValueAsString(evidence));
            }finally{flow.close();}
        }
    }
}
