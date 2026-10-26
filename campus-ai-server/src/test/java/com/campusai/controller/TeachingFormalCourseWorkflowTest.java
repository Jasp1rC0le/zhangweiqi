package com.campusai.controller;
import com.campusai.teaching.*;
import org.junit.jupiter.api.*;
import org.springframework.test.util.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
@Timeout(25)
class TeachingFormalCourseWorkflowTest {
    TeachingResponsibilityWorkflowTest flow;TeachingRosterWorkflowTest f;
    @BeforeEach void setup()throws Exception{flow=new TeachingResponsibilityWorkflowTest();flow.setup();f=flow.f;flow.approve(6,"TEACHER");TeachingService actual=AopTestUtils.getTargetObject(f.service);ReflectionTestUtils.setField(actual,"identities",flow.identities);}
    @AfterEach void close(){if(flow!=null)flow.close();}
    TeachingService.CourseInput input(){return new TeachingService.CourseInput(UUID.randomUUID().toString(),f.a,6L,"模拟连续教学","模拟学期",java.time.LocalDate.of(2026,10,12),4,"14:00","15:35",List.of(1,3),"模拟教室");}
    @Test void previewIsReadOnlyAndCreatedDefinitionHasTheExactServerFingerprint()throws Exception{
        var in=input();int before=flow.count("teaching_courses");var p=f.send(1,post("/api/admin/teaching/courses/preview"),new TeachingService.CourseDraft(in,"CLASS","",List.of()),200);assertEquals(before,flow.count("teaching_courses"));assertEquals(2,p.get("members").asInt());assertEquals(64,p.get("fingerprint").asString().length());
        f.send(1,post("/api/admin/teaching/courses"),in,200);var d=f.read(1,get("/api/admin/teaching/courses/"+in.id()+"/definition"),200);assertEquals(p.get("fingerprint").asString(),d.get("fingerprint").asString());assertEquals(in.classId(),d.get("course").get("classId").asString());f.send(1,post("/api/admin/teaching/courses"),in,200);assertEquals(before+1,flow.count("teaching_courses"));
    }
    @Test void teacherSearchAndSelectionArePagedSameSchoolAndReviewedNotANameBasedPrivilege(){
        var teachers=f.service.configurationPage(1,"TEACHER",0,25,"","6");assertEquals(1,teachers.total());assertEquals("6",teachers.selected().value());assertNull(f.service.configurationPage(1,"TEACHER",0,25,"","10").selected());assertEquals(403,flow.code(()->f.service.configurationPage(2,"TEACHER",0,25,"","6")));
        f.db.update("UPDATE users SET nickname='教师%_示例' WHERE id=6");assertEquals(1,f.service.configurationPage(1,"TEACHER",0,25,"%_","").total());assertEquals(0,f.service.configurationPage(1,"TEACHER",0,25,"不存在","").total());
    }
    @Test void foreignAndUnreviewedTargetsCannotPreviewOrReadDefinition()throws Exception{
        var in=input();var bad=new TeachingService.CourseInput(in.id(),in.classId(),10L,in.name(),in.semester(),in.firstMonday(),in.weekday(),in.startTime(),in.endTime(),in.weeks(),in.room());int before=flow.count("teaching_courses");f.send(1,post("/api/admin/teaching/courses/preview"),new TeachingService.CourseDraft(bad,"CLASS","",List.of()),403);f.send(2,post("/api/admin/teaching/courses/preview"),new TeachingService.CourseDraft(in,"CLASS","",List.of()),403);f.read(2,get("/api/admin/teaching/courses/"+f.course+"/definition"),403);f.read(1,get("/api/admin/teaching/courses/"+in.id()+"/definition"),404);assertEquals(before,flow.count("teaching_courses"));
    }
}
