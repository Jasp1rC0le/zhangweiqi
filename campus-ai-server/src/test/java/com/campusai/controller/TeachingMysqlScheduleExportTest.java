package com.campusai.controller;
import com.campusai.timetable.*;
import com.campusai.teaching.TeachingService;
import com.zaxxer.hikari.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import java.util.*;
import java.time.*;
import java.nio.file.*;
import static org.junit.jupiter.api.Assertions.*;

@Timeout(100) @EnabledIfEnvironmentVariable(named="RUN_SCHEDULE_EXPORT_MYSQL",matches="true")
class TeachingMysqlScheduleExportTest {
    @Test void nativeFileSourcesReviewedDraftFingerprintPaginationAndRevocation()throws Exception{
        String schema=System.getenv("SCHEDULE_TEST_MYSQL_SCHEMA");assertTrue(schema!=null&&schema.matches("campthink_files_20261017_[a-f0-9]{12}"));int port=Integer.parseInt(System.getenv("SCHEDULE_TEST_MYSQL_PORT"));assertTrue(port>=1024&&port<=65535);
        var cfg=new HikariConfig();cfg.setJdbcUrl("jdbc:mysql://127.0.0.1:"+port+"/"+schema+"?serverTimezone=Asia/Shanghai&characterEncoding=utf8&connectTimeout=2000&socketTimeout=8000");cfg.setUsername(System.getenv("SCHEDULE_TEST_MYSQL_USER"));cfg.setPassword(System.getenv("SCHEDULE_TEST_MYSQL_PASSWORD"));cfg.setMaximumPoolSize(4);cfg.setMinimumIdle(1);cfg.setConnectionTimeout(2000);cfg.setPoolName("task-schedule-files-only");
        try(var pool=new HikariDataSource(cfg)){var flow=new ScheduleExportWorkflowTest();flow.syntheticDataSource=pool;long started=System.nanoTime();
            try{flow.setup();var f=flow.f;f.db.setQueryTimeout(5);flow.mixedSourcesAreMergedWithinOneReadSnapshotAndOriginalSourceCanStillBeExportedSeparately();flow.fourRolesAndNormalAdminNeverExportPrivateRostersOrInventOtherPeopleAccess();flow.actualFilesHaveTypedDatesLiteralTextUtf8IcsAndReadableChinesePdf();flow.signedControllerEnforcesSessionsNormalRolesUnknownFieldsAndVerifiedDownloadHeaders();
                var in=new TeachingService.CourseInput(UUID.randomUUID().toString(),f.a,6L,"原生模拟教学草稿","原生模拟学期",LocalDate.of(2026,10,12),2,"08:30","10:05",List.of(1,2),"F3-111");var preview=f.service.previewCourse(1,new TeachingService.CourseDraft(in,"CLASS","",List.of()));int before=f.db.queryForObject("SELECT COUNT(*) FROM teaching_courses",Integer.class);assertEquals(in.id(),f.service.createCourse(1,in));assertEquals(preview.fingerprint(),f.service.courseDefinition(1,in.id()).fingerprint());assertEquals(in.id(),f.service.createCourse(1,in));assertEquals(before+1,f.db.queryForObject("SELECT COUNT(*) FROM teaching_courses",Integer.class));
                for(int i=0;i<501;i++){String id=UUID.randomUUID().toString();Instant start=Instant.parse("2026-10-14T06:00:00Z").plusSeconds((i+1)*60L);f.db.update("INSERT INTO teaching_lessons(id,school_id,course_id,class_id,starts_at,ends_at,cancelled) VALUES(?,?,?,?,?,?,FALSE)",id,1,f.course,f.a,java.sql.Timestamp.from(start),java.sql.Timestamp.from(start.plusSeconds(5700)));f.db.update("INSERT INTO teaching_attendance SELECT ?,student_id,student_number,student_name,status FROM teaching_attendance WHERE lesson_id=?",id,f.first);f.db.update("INSERT INTO teaching_attendance_scopes(lesson_id,student_id,school_id,admin_class_id,college,withdrawn,source) SELECT ?,student_id,school_id,admin_class_id,college,withdrawn,source FROM teaching_attendance_scopes WHERE lesson_id=?",id,f.first);}
                var rows=flow.source.read(6,flow.filter("TEACHING","TEACHER","CSV"));assertEquals(505,rows.entries().size());assertEquals(505,new HashSet<>(rows.entries().stream().map(ScheduleExportSource.Row::id).toList()).size());
                var p=flow.service.prepare(7,flow.filter("TEACHING","COUNSELOR","CSV"));f.db.update("DELETE FROM teaching_grants WHERE user_id=7");assertEquals(403,flow.code(()->flow.service.download(7,new ScheduleExportService.Download(p.token()))));
                var q=flow.service.prepare(6,flow.filter("TEACHING","TEACHER","CSV"));f.db.update("UPDATE teaching_courses SET room='原生模拟变更教室' WHERE id=?",f.course);assertEquals(409,flow.code(()->flow.service.download(6,new ScheduleExportService.Download(q.token()))));
                var evidence=new LinkedHashMap<String,Object>();evidence.put("engine",f.db.queryForObject("SELECT VERSION()",String.class));evidence.put("schema",schema);evidence.put("syntheticOnly",true);evidence.put("schoolSchemaTargeted",false);evidence.put("actualFiveFileFormats",true);evidence.put("pdfExactChineseExtraction",true);evidence.put("xlsxTypedDatesAndBlankCells",true);evidence.put("mixedSourcesMerged",true);evidence.put("normalControllerWithSignedMockSessions",true);evidence.put("draftPreviewReadOnlyFingerprintReadbackAndReplay",true);evidence.put("reviewedTeacherGateTestedInH2NotThisLegacyNativeFixture",true);evidence.put("completeNativeScheduleRows",505);evidence.put("revokedDownload403",true);evidence.put("changedSource409",true);evidence.put("elapsedMillis",(System.nanoTime()-started)/1000000);Path out=Path.of("../.local/runtime/teaching-mysql-schedule-files-2026-10-17.json");Files.createDirectories(out.getParent());Files.writeString(out,f.json.writeValueAsString(evidence));System.out.println("MYSQL_SCHEDULE_FILES "+f.json.writeValueAsString(evidence));
            }finally{flow.close();}
        }
    }
}
