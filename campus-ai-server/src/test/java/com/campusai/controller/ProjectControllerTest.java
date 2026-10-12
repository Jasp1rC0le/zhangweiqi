package com.campusai.controller;

import com.campusai.exception.GlobalExceptionHandler;
import com.campusai.project.ProjectContent;
import com.campusai.project.ProjectService;
import com.campusai.security.AuthSessionService;
import com.campusai.security.JwtInterceptor;
import com.campusai.security.JwtService;
import io.jsonwebtoken.Claims;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import tools.jackson.databind.ObjectMapper;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class ProjectControllerTest {
    private final ProjectService projects = mock(ProjectService.class);
    private final JwtService jwt = mock(JwtService.class);
    private final AuthSessionService sessions = mock(AuthSessionService.class);
    private final ObjectMapper json = new ObjectMapper();
    private MockMvc mvc;
    @BeforeEach void setup() {
        Claims claims = mock(Claims.class);
        when(claims.getSubject()).thenReturn("1");
        when(claims.get("role", String.class)).thenReturn("STUDENT");
        when(claims.get("sid", String.class)).thenReturn("session");
        when(jwt.parseToken("test-token")).thenReturn(claims);
        when(sessions.active("session", 1L, "STUDENT")).thenReturn(true);
        mvc = MockMvcBuilders.standaloneSetup(new ProjectController(projects))
                .setControllerAdvice(new GlobalExceptionHandler())
                .addInterceptors(new JwtInterceptor(jwt, sessions)).build();
    }
    @Test void rejectsAnonymousProjectReadsAndWrites() throws Exception {
        mvc.perform(get("/api/projects")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/projects/capabilities")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/projects").contentType("application/json").content("{}")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/projects/private/versions/1")).andExpect(status().isUnauthorized());
        mvc.perform(delete("/api/projects/private?revision=1")).andExpect(status().isUnauthorized());
        verifyNoInteractions(projects);
    }
    @Test void ownerAlwaysComesFromSessionAndResponsesAreNotCached() throws Exception {
        String id = UUID.randomUUID().toString();
        var content = new ProjectContent("报告", "general", null, "", "", List.of());
        when(projects.create(eq(1L), eq(id), any())).thenReturn(new ProjectService.Project(id, 1, false, LocalDateTime.now(), content));
        String payload = json.writeValueAsString(new ProjectController.Create(id, content));
        mvc.perform(post("/api/projects").header("Authorization", "Bearer test-token").contentType("application/json").content(payload))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.revision").value(1));
        verify(projects).create(eq(1L), eq(id), eq(content));
    }
    @Test void rejectsInvalidAndOversizedNestedInputs() throws Exception {
        var content = new ProjectContent("", "unsupported", null, "", "", List.of());
        mvc.perform(post("/api/projects").header("Authorization", "Bearer test-token").contentType("application/json")
                .content(json.writeValueAsString(new ProjectController.Create(UUID.randomUUID().toString(), content))))
                .andExpect(status().isBadRequest());
        var oversized = new ProjectContent("项目", "general", null, "", "x".repeat(50001), List.of());
        mvc.perform(put("/api/projects/one").header("Authorization", "Bearer test-token").contentType("application/json")
                .content(json.writeValueAsString(new ProjectController.Save(0, false, oversized))))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(projects);
    }
    @Test void validatesDataSheetLimitsAndPreservesAcceptedContent() throws Exception {
        mvc.perform(get("/api/projects/capabilities").header("Authorization", "Bearer test-token"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.dataSheetVersion").value(1))
                .andExpect(header().string("Cache-Control", "no-store"));
        var sheet = new ProjectContent.DataSheet("id,m,r\na,12,10", "测试记录", 1, 2, "V", true, new java.math.BigDecimal("5"));
        String id = UUID.randomUUID().toString();
        var content = new ProjectContent("实验报告", "engineering", null, "", "", List.of(), sheet);
        when(projects.create(eq(1L), eq(id), any())).thenReturn(new ProjectService.Project(id, 1, false, LocalDateTime.now(), content));
        mvc.perform(post("/api/projects").header("Authorization", "Bearer test-token").contentType("application/json")
                .content(json.writeValueAsString(new ProjectController.Create(id, content))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.content.dataSheet.csv").value(sheet.csv()))
                .andExpect(jsonPath("$.content.dataSheet.sameUnitConfirmed").value(true));
        clearInvocations(projects);
        var invalidSheet = new ProjectContent.DataSheet("x".repeat(50001), "", 30, -2, "", false, new java.math.BigDecimal("-1"));
        var invalid = new ProjectContent("实验", "engineering", null, "", "", List.of(), invalidSheet);
        mvc.perform(put("/api/projects/one").header("Authorization", "Bearer test-token").contentType("application/json")
                .content(json.writeValueAsString(new ProjectController.Save(1, false, invalid))))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(projects);
    }
    @Test void validatesCalculationAndAdvertisesVersion() throws Exception {
        mvc.perform(get("/api/projects/capabilities").header("Authorization", "Bearer test-token"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.calculationVersion").value(1));
        var calculation=new ProjectContent.Calculation("x".repeat(201),30,-2,-1,"", "", "",true,new java.math.BigDecimal("-1"));
        var sheet=new ProjectContent.DataSheet("x\n1","",-1,-1,"",false,new java.math.BigDecimal("5"),calculation);
        var content=new ProjectContent("公式测试","business",null,"","",List.of(),sheet);
        mvc.perform(post("/api/projects").header("Authorization","Bearer test-token").contentType("application/json")
                .content(json.writeValueAsString(new ProjectController.Create(UUID.randomUUID().toString(),content))))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(projects);
    }
    @Test void validatesFeedbackAndAdvertisesCapability() throws Exception {
        mvc.perform(get("/api/projects/capabilities").header("Authorization", "Bearer test-token"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.reviewFeedbackVersion").value(1));
        var feedback = new ProjectContent.ReviewFeedback("r1", "需复核", "a".repeat(64), "由教师确认");
        String id = UUID.randomUUID().toString();
        var content = new ProjectContent("报告", "general", null, "", "", List.of(), null, List.of(feedback));
        when(projects.create(eq(1L), eq(id), any())).thenReturn(new ProjectService.Project(id, 1, false, LocalDateTime.now(), content));
        mvc.perform(post("/api/projects").header("Authorization", "Bearer test-token").contentType("application/json")
                .content(json.writeValueAsString(new ProjectController.Create(id, content))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.content.reviewFeedback[0].reason").value("由教师确认"));
        clearInvocations(projects);
        var invalid = new ProjectContent("报告", "general", null, "", "", List.of(), null,
                List.of(new ProjectContent.ReviewFeedback("r1", "需复核", "fake", "x".repeat(501))));
        mvc.perform(put("/api/projects/one").header("Authorization", "Bearer test-token").contentType("application/json")
                .content(json.writeValueAsString(new ProjectController.Save(1, false, invalid))))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(projects);
    }
}
