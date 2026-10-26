package com.campusai.controller;
import com.campusai.exception.GlobalExceptionHandler;
import com.campusai.security.*;
import com.campusai.timetable.CourseScheduleService;
import io.jsonwebtoken.Claims;
import org.junit.jupiter.api.*;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import tools.jackson.databind.ObjectMapper;
import java.time.LocalDate;
import java.util.List;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
@Timeout(10)
class CourseScheduleControllerTest {
    CourseScheduleService service=mock(CourseScheduleService.class); ObjectMapper json=new ObjectMapper(); MockMvc mvc;
    @BeforeEach void setup() {
        JwtService jwt=mock(JwtService.class); AuthSessionService sessions=mock(AuthSessionService.class); Claims claims=mock(Claims.class);
        when(claims.getSubject()).thenReturn("1"); when(claims.get("role",String.class)).thenReturn("STUDENT"); when(claims.get("sid",String.class)).thenReturn("session");
        when(jwt.parseToken("test-token")).thenReturn(claims); when(sessions.active("session",1L,"STUDENT")).thenReturn(true);
        mvc=MockMvcBuilders.standaloneSetup(new CourseScheduleController(service,json)).setControllerAdvice(new GlobalExceptionHandler()).addInterceptors(new JwtInterceptor(jwt,sessions)).build();
    }
    @Test void anonymousRequestsCannotReadSaveConfirmOrDelete() throws Exception {
        mvc.perform(get("/api/timetable/courses")).andExpect(status().isUnauthorized());
        mvc.perform(put("/api/timetable/courses").contentType("application/json").content("{}")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/timetable/courses/checked?revision=1")).andExpect(status().isUnauthorized());
        mvc.perform(delete("/api/timetable/courses?revision=1")).andExpect(status().isUnauthorized()); verifyNoInteractions(service);
    }
    @Test void urlOwnerIsIgnoredAndResponsesAreNotCacheable() throws Exception {
        when(service.get(1L)).thenReturn(new CourseScheduleService.State(null));
        mvc.perform(get("/api/timetable/courses?userId=2").header("Authorization","Bearer test-token")).andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store")); verify(service).get(1L);
        var input = new CourseScheduleService.Input(0,"示例",LocalDate.of(2026,9,7),7,List.of(new CourseScheduleService.Course("A",1,"08:00","09:00",List.of(1),"")));
        when(service.save(eq(1L),any())).thenReturn(new CourseScheduleService.State(null));
        mvc.perform(put("/api/timetable/courses?userId=2").contentType("application/json").content(json.writeValueAsBytes(input)).header("Authorization","Bearer test-token")).andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store")); verify(service).save(1L,input);
    }
    @Test void corruptAndOversizedJsonFailBeforeService() throws Exception {
        mvc.perform(put("/api/timetable/courses").contentType("application/json").content("bad").header("Authorization","Bearer test-token")).andExpect(status().isBadRequest());
        mvc.perform(put("/api/timetable/courses").contentType("application/json").content(new byte[100001]).header("Authorization","Bearer test-token")).andExpect(status().isPayloadTooLarge()); verifyNoInteractions(service);
    }
    @Test void confirmationAndDeletionUseOnlySessionOwner() throws Exception {
        when(service.checked(1L,3)).thenReturn(new CourseScheduleService.State(null));
        mvc.perform(post("/api/timetable/courses/checked?revision=3&userId=2").header("Authorization","Bearer test-token")).andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store"));
        mvc.perform(delete("/api/timetable/courses?revision=3&userId=2").header("Authorization","Bearer test-token")).andExpect(status().isNoContent()); verify(service).checked(1L,3); verify(service).delete(1L,3);
    }
    @Test void periodPayloadPreservesIntegersAndRejectsSilentRoundingOrExtraIdentity() throws Exception {
        var body = "{\"revision\":0,\"semester\":\"示例\",\"firstMonday\":\"2026-09-07\",\"remindDays\":7,\"courses\":[{\"name\":\"节次示例\",\"weekday\":1,\"startPeriod\":1,\"endPeriod\":2,\"weeks\":[6],\"room\":\"A\"}]}";
        when(service.save(eq(1L),any())).thenReturn(new CourseScheduleService.State(null));
        mvc.perform(put("/api/timetable/courses").contentType("application/json").content(body).header("Authorization","Bearer test-token")).andExpect(status().isOk());
        verify(service).save(eq(1L),argThat(input -> input.courses().get(0).startPeriod() == 1 && input.courses().get(0).startTime() == null));
        clearInvocations(service);
        for (String bad : List.of(body.replace("\"startPeriod\":1", "\"startPeriod\":1.5"),body.replace("\"weekday\":1", "\"weekday\":1.2"),body.replace("\"name\":", "\"studentId\":\"private\",\"name\":"))) {
            mvc.perform(put("/api/timetable/courses").contentType("application/json").content(bad).header("Authorization","Bearer test-token")).andExpect(status().isBadRequest());
        }
        verifyNoInteractions(service);
    }
}
