package com.campusai.controller;

import com.campusai.timetable.*;
import com.campusai.teaching.TeachingService;
import org.junit.jupiter.api.*;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.web.server.ResponseStatusException;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.apache.poi.ss.usermodel.CellType;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.text.PDFTextStripper;
import java.time.*;
import java.nio.file.*;
import java.nio.charset.StandardCharsets;
import java.io.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

@Timeout(45)
class ScheduleExportWorkflowTest {
    TeachingRosterWorkflowTest f;AnnotationConfigApplicationContext context;ScheduleExportSource source;ScheduleFileWriter writer;ScheduleExportService service;javax.sql.DataSource syntheticDataSource;
    @BeforeEach void setup()throws Exception{
        f=new TeachingRosterWorkflowTest();f.syntheticDataSource=syntheticDataSource;f.setup();context=new AnnotationConfigApplicationContext();context.register(TeachingRosterWorkflowTest.Tx.class);context.registerBean(PlatformTransactionManager.class,()->new DataSourceTransactionManager(f.db.getDataSource()));context.registerBean(ScheduleExportSource.class,()->new ScheduleExportSource(f.db,f.context.getBean(CourseScheduleService.class),f.unified,f.service,1));context.refresh();source=context.getBean(ScheduleExportSource.class);writer=new ScheduleFileWriter(f.json);service=new ScheduleExportService(source,writer,f.json,f.clock);
        f.context.getBean(CourseScheduleService.class).save(2L,new CourseScheduleService.Input(0,"模拟学期",LocalDate.of(2026,10,12),7,List.of(new CourseScheduleService.Course("合成合班选修",3,"14:00","15:35",List.of(1,2),"合成教学室"),new CourseScheduleService.Course("个人模拟数学",4,"08:30","10:05",List.of(1,2),"F2-306"))));
    }
    @AfterEach void close(){if(context!=null)context.close();if(f!=null)f.close();}
    ScheduleExportSource.Filter filter(String source,String view,String format){return new ScheduleExportSource.Filter(source,view,LocalDate.of(2026,10,12),LocalDate.of(2026,10,25),"","ALL",format,"",false);}
    int code(Runnable r){return assertThrows(ResponseStatusException.class,r::run).getStatusCode().value();}
    @Test void mixedSourcesAreMergedWithinOneReadSnapshotAndOriginalSourceCanStillBeExportedSeparately(){
        var mixed=source.read(2,filter("MY","STUDENT","JSON"));assertEquals(4,mixed.entries().size());assertEquals(2,mixed.entries().stream().filter(r->r.sources().size()==2).count());assertTrue(mixed.entries().stream().filter(r->r.sources().size()==2).allMatch(r->!r.teacher().isBlank()));
        var privateOnly=source.read(2,filter("PERSONAL","STUDENT","JSON"));assertEquals(4,privateOnly.entries().size());assertTrue(privateOnly.entries().stream().allMatch(r->r.teacher().isBlank()&&r.sources().equals(List.of("PERSONAL"))));
        var morning=new ScheduleExportSource.Filter("MY","STUDENT",LocalDate.of(2026,10,12),LocalDate.of(2026,10,25),"","MORNING","JSON","",false);assertEquals(2,source.read(2,morning).entries().size());
    }
    @Test void fourRolesAndNormalAdminNeverExportPrivateRostersOrInventOtherPeopleAccess()throws Exception{
        for(var pair:List.of(Map.entry(2L,"STUDENT"),Map.entry(6L,"TEACHER"),Map.entry(7L,"COUNSELOR"),Map.entry(8L,"SECRETARY"),Map.entry(1L,"ADMIN"))){var p=service.prepare(pair.getKey(),filter("TEACHING",pair.getValue(),"JSON"));var bytes=service.download(pair.getKey(),new ScheduleExportService.Download(p.token())).bytes();String content=new String(bytes,StandardCharsets.UTF_8);assertFalse(content.contains("synthetic-2"));assertFalse(content.contains("studentNumber"));assertFalse(content.contains("attendance"));assertFalse(content.contains("userId"));assertTrue(p.count()>0);}
        assertEquals(403,code(()->source.read(2,filter("TEACHING","ADMIN","JSON"))));assertEquals(403,code(()->source.read(11,filter("TEACHING","TEACHER","JSON"))));assertEquals(400,code(()->source.read(2,filter("MY","SECRETARY","JSON"))));
        var foreignClass=new ScheduleExportSource.Filter("TEACHING","COUNSELOR",LocalDate.of(2026,10,12),LocalDate.of(2026,10,25),f.b,"ALL","JSON","",false);assertEquals(404,code(()->source.read(7,foreignClass)));
    }
    @Test void actualFilesHaveTypedDatesLiteralTextUtf8IcsAndReadableChinesePdf()throws Exception{
        var snapshot=source.read(2,filter("MY","STUDENT","XLSX"));var xlsx=writer.write(snapshot,f.clock.instant());
        try(var book=new XSSFWorkbook(new ByteArrayInputStream(xlsx.bytes()))){var sheet=book.getSheetAt(0);assertEquals(1,book.getNumberOfSheets());assertEquals(CellType.NUMERIC,sheet.getRow(5).getCell(0).getCellType());assertEquals(CellType.NUMERIC,sheet.getRow(5).getCell(2).getCellType());assertEquals(CellType.BLANK,sheet.getRow(6).getCell(7).getCellType());assertEquals("yyyy-mm-dd",sheet.getRow(5).getCell(0).getCellStyle().getDataFormatString());assertNotNull(sheet.getPaneInformation());assertEquals(4,sheet.getLastRowNum()-4);}
        Path dir=Path.of("../.local/runtime/schedule-export-2026-10-17");Files.createDirectories(dir);Files.write(dir.resolve("synthetic.xlsx"),xlsx.bytes());
        var pdf=writer.write(source.read(2,filter("MY","STUDENT","PDF")),f.clock.instant());Files.write(dir.resolve("synthetic.pdf"),pdf.bytes());try(var doc=Loader.loadPDF(pdf.bytes())){assertEquals(1,doc.getNumberOfPages());String text=new PDFTextStripper().getText(doc);Files.writeString(dir.resolve("synthetic-pdf-text.txt"),text);assertTrue(text.contains("个人模拟数学"),text);assertTrue(text.contains("合成教学室"),text);assertTrue(text.contains("2026-10-15"),text);}
        for(String format:List.of("CSV","ICS","JSON")){var file=writer.write(source.read(2,filter("MY","STUDENT",format)),f.clock.instant());Files.write(dir.resolve("synthetic."+file.extension()),file.bytes());String content=new String(file.bytes(),StandardCharsets.UTF_8);assertTrue(content.contains("个人模拟数学"));if(format.equals("ICS")){assertTrue(content.contains("DTSTART:20261014T060000Z"));assertEquals(4,content.split("BEGIN:VEVENT",-1).length-1);for(String line:content.split("\r\n"))assertTrue(line.getBytes(StandardCharsets.UTF_8).length<=75);}}
    }
    @Test void staleChangedBorrowedExpiredOrRevokedPreparationsNeverReturnCachedFiles()throws Exception{
        var p=service.prepare(7,filter("TEACHING","COUNSELOR","CSV"));assertEquals(410,code(()->service.download(8,new ScheduleExportService.Download(p.token()))));
        f.db.update("DELETE FROM teaching_grants WHERE user_id=7");assertEquals(403,code(()->service.download(7,new ScheduleExportService.Download(p.token()))));
        var q=service.prepare(2,filter("MY","STUDENT","CSV"));f.db.update("UPDATE teaching_courses SET room='已更换模拟教室' WHERE id=?",f.course);assertEquals(409,code(()->service.download(2,new ScheduleExportService.Download(q.token()))));
        var r=service.prepare(2,filter("MY","STUDENT","CSV"));f.clock.value=f.clock.value.plusSeconds(301);assertEquals(410,code(()->service.download(2,new ScheduleExportService.Download(r.token()))));
    }
    @Test void unfixedPeriodTimesFailIcsAndPeriodFilteringButRemainHonestInTheOtherFormats()throws Exception{
        f.context.getBean(CourseScheduleService.class).save(3L,new CourseScheduleService.Input(0,"模拟学期",LocalDate.of(2026,10,12),7,List.of(new CourseScheduleService.Course("未知钟点模拟课",3,null,null,List.of(1),"模拟教室",9,10))));
        var snapshot=source.read(3,filter("PERSONAL","STUDENT","ICS"));assertNull(snapshot.entries().get(0).startTime());assertEquals(400,code(()->{try{writer.write(snapshot,f.clock.instant());}catch(IOException e){throw new UncheckedIOException(e);}}));
        assertTrue(new String(writer.write(source.read(3,filter("PERSONAL","STUDENT","CSV")),f.clock.instant()).bytes(),StandardCharsets.UTF_8).contains("钟点待配置"));
    }
    @Test void moreThanFiveHundredLessonsAreCompleteAcrossPagesAndTheTwoThousandLimitNeverTruncates(){
        for(int i=0;i<2000;i++){String id=UUID.randomUUID().toString();Instant start=Instant.parse("2026-10-14T06:00:00Z").plusSeconds((i+1)*60L);f.db.update("INSERT INTO teaching_lessons(id,school_id,course_id,class_id,starts_at,ends_at,cancelled) VALUES(?,?,?,?,?,?,FALSE)",id,1,f.course,f.a,java.sql.Timestamp.from(start),java.sql.Timestamp.from(start.plusSeconds(5700)));f.db.update("INSERT INTO teaching_attendance SELECT ?,student_id,student_number,student_name,status FROM teaching_attendance WHERE lesson_id=?",id,f.first);f.db.update("INSERT INTO teaching_attendance_scopes(lesson_id,student_id,school_id,admin_class_id,college,withdrawn,source) SELECT ?,student_id,school_id,admin_class_id,college,withdrawn,source FROM teaching_attendance_scopes WHERE lesson_id=?",id,f.first);if(i==700){var rows=source.read(6,filter("TEACHING","TEACHER","CSV"));assertEquals(703,rows.entries().size());assertEquals(703,new HashSet<>(rows.entries().stream().map(ScheduleExportSource.Row::id).toList()).size());}}
        assertEquals(400,code(()->source.read(6,filter("TEACHING","TEACHER","CSV"))));
    }
    @Test void formulaLikeCellsStayTextAndCsvAndCalendarEscapingCannotCreateNewOperations()throws Exception{
        var f=filter("PERSONAL","STUDENT","CSV");var row=new ScheduleExportSource.Row(UUID.randomUUID().toString(),LocalDate.of(2026,10,14),"=HYPERLINK(\"https://invalid\",\"x\")","教室;分号,逗号\\斜杠","模拟老师","模拟班","08:30","09:15","08:30-09:15",List.of("PERSONAL"),false);
        for(String format:List.of("CSV","XLSX","ICS")){var q=new ScheduleExportSource.Filter(f.source(),f.view(),f.from(),f.to(),"","ALL",format,"",false);var output=writer.write(new ScheduleExportSource.Snapshot(q,"模拟",List.of(row),List.of()),this.f.clock.instant());if(format.equals("CSV"))assertTrue(new String(output.bytes(),StandardCharsets.UTF_8).contains("'=HYPERLINK"));if(format.equals("XLSX"))try(var book=new XSSFWorkbook(new ByteArrayInputStream(output.bytes()))){assertEquals(CellType.STRING,book.getSheetAt(0).getRow(5).getCell(5).getCellType());}if(format.equals("ICS"))assertTrue(new String(output.bytes(),StandardCharsets.UTF_8).contains("教室\\;分号\\,逗号\\\\斜杠"));}
    }
    @Test void signedControllerEnforcesSessionsNormalRolesUnknownFieldsAndVerifiedDownloadHeaders()throws Exception{
        byte[] key=new byte[64];new java.security.SecureRandom().nextBytes(key);var jwt=new com.campusai.security.JwtService(Base64.getEncoder().encodeToString(key),3600000);var sessions=org.mockito.Mockito.mock(com.campusai.security.AuthSessionService.class);var tokens=new HashMap<Long,String>();
        for(long id:List.of(1L,2L,11L)){var u=new com.campusai.user.entity.User();u.setId(id);u.setUsername("export-synthetic-"+id);u.setRole(id==1?"ADMIN":"STUDENT");tokens.put(id,jwt.generateToken(u,"export-demo-"+id));org.mockito.Mockito.when(sessions.active("export-demo-"+id,id,u.getRole())).thenReturn(true);}
        var mvc=org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup(new ScheduleExportController(source,service,f.service,f.json)).setControllerAdvice(new com.campusai.exception.GlobalExceptionHandler()).addFilters(new com.campusai.security.ApiBoundaryFilter("http://localhost:5173")).addInterceptors(new com.campusai.security.JwtInterceptor(jwt,sessions)).build();
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/timetable/exports/access")).andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isUnauthorized());
        var prepared=mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/timetable/exports/prepare").header("Authorization","Bearer "+tokens.get(2L)).contentType("application/json").content(f.json.writeValueAsString(filter("MY","STUDENT","XLSX")))).andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk()).andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.header().string("Cache-Control","no-store")).andReturn();
        var p=f.json.readTree(prepared.getResponse().getContentAsString());String token=p.get("token").asString(),sha=p.get("sha256").asString();
        var download=mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/timetable/exports/download").header("Authorization","Bearer "+tokens.get(2L)).contentType("application/json").content(f.json.writeValueAsString(new ScheduleExportService.Download(token)))).andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk()).andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.header().string("X-Content-SHA256",sha)).andReturn();assertEquals(sha,ScheduleFileWriter.hash(download.getResponse().getContentAsByteArray()));
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/timetable/exports/download").header("Authorization","Bearer "+tokens.get(11L)).contentType("application/json").content(f.json.writeValueAsString(new ScheduleExportService.Download(token)))).andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isGone());
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/timetable/exports/prepare").header("Authorization","Bearer "+tokens.get(2L)).contentType("application/json").content("{\"userId\":999,"+f.json.writeValueAsString(filter("MY","STUDENT","CSV")).substring(1))).andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isBadRequest());
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/timetable/exports/prepare").header("Authorization","Bearer "+tokens.get(2L)).contentType("application/json").content(f.json.writeValueAsString(filter("TEACHING","ADMIN","CSV")))).andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isForbidden());
    }
}
