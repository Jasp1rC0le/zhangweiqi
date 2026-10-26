package com.campusai.controller;

import com.campusai.exception.GlobalExceptionHandler;
import com.campusai.security.ApiBoundaryFilter;
import com.campusai.security.AuthSessionService;
import com.campusai.security.JwtInterceptor;
import com.campusai.security.JwtService;
import com.campusai.timetable.CourseScheduleService;
import com.campusai.timetable.TimetableService;
import io.jsonwebtoken.Claims;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Verifies filter, identity interceptor and error handler together, without real accounts or data. */
@Timeout(10)
class PrivateTimetableBoundaryTest {
    private final TimetableService images = mock(TimetableService.class);
    private final CourseScheduleService courses = mock(CourseScheduleService.class);
    private final AuthSessionService sessions = mock(AuthSessionService.class);
    private MockMvc mvc;

    @BeforeEach void setup() {
        JwtService jwt = mock(JwtService.class);
        Claims claims = mock(Claims.class);
        when(claims.getSubject()).thenReturn("1");
        when(claims.get("role", String.class)).thenReturn("STUDENT");
        when(claims.get("sid", String.class)).thenReturn("synthetic-session");
        when(jwt.parseToken("synthetic-token")).thenReturn(claims);
        when(sessions.active("synthetic-session", 1L, "STUDENT")).thenReturn(true);
        var json = new ObjectMapper();
        mvc = MockMvcBuilders.standaloneSetup(new TimetableController(images, json),
                        new CourseScheduleController(courses, json))
                .setControllerAdvice(new GlobalExceptionHandler())
                .addFilters(new ApiBoundaryFilter("http://localhost:5173"))
                .addInterceptors(new JwtInterceptor(jwt, sessions)).build();
    }

    private ResultActions protectedResponse(ResultActions result) throws Exception {
        return result.andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(header().string("Pragma", "no-cache"))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                .andExpect(header().string("Referrer-Policy", "no-referrer"))
                .andExpect(header().string("X-Frame-Options", "DENY"));
    }

    @Test void anonymousReadsAndMutationsKeepPrivateErrorHeaders() throws Exception {
        for (String path : new String[]{"/api/timetable", "/api/timetable/image?revision=1", "/api/timetable/courses"})
            protectedResponse(mvc.perform(get(path))).andExpect(status().isUnauthorized());
        protectedResponse(mvc.perform(delete("/api/timetable?revision=1"))).andExpect(status().isUnauthorized());
        protectedResponse(mvc.perform(post("/api/timetable/courses/checked?revision=1"))).andExpect(status().isUnauthorized());
        verifyNoInteractions(images, courses);
    }

    @Test void revokedBearerSessionCannotReachEitherPrivateService() throws Exception {
        when(sessions.active("synthetic-session", 1L, "STUDENT")).thenReturn(false);
        protectedResponse(mvc.perform(get("/api/timetable").header("Authorization", "Bearer synthetic-token")))
                .andExpect(status().isUnauthorized());
        protectedResponse(mvc.perform(put("/api/timetable/courses").contentType("application/json").content("{}")
                .header("Authorization", "Bearer synthetic-token"))).andExpect(status().isUnauthorized());
        verifyNoInteractions(images, courses);
    }

    @Test void crossSiteWritesAreRejectedBeforeAuthenticationOrParsing() throws Exception {
        for (String origin : new String[]{"null", "https://untrusted.example", "http://localhost:5173.evil.example"}) {
            protectedResponse(mvc.perform(put("/api/timetable/courses").header("Origin", origin)
                    .header("Authorization", "Bearer synthetic-token").contentType("application/json").content("bad")))
                    .andExpect(status().isForbidden());
            protectedResponse(mvc.perform(delete("/api/timetable?revision=1").header("Origin", origin)
                    .header("Authorization", "Bearer synthetic-token"))).andExpect(status().isForbidden());
            protectedResponse(mvc.perform(multipart(HttpMethod.PUT, "/api/timetable").header("Origin", origin)
                    .header("Authorization", "Bearer synthetic-token")
                    .file(new MockMultipartFile("metadata", "bad".getBytes()))
                    .file(new MockMultipartFile("image", new byte[]{1})))) .andExpect(status().isForbidden());
        }
        verifyNoInteractions(sessions, images, courses);
    }

    @Test void validOriginDoesNotBypassMalformedOrOversizedPayloadChecks() throws Exception {
        protectedResponse(mvc.perform(put("/api/timetable/courses").header("Origin", "http://localhost:5173")
                .header("Authorization", "Bearer synthetic-token").contentType("application/json").content("bad")))
                .andExpect(status().isBadRequest());
        protectedResponse(mvc.perform(multipart(HttpMethod.PUT, "/api/timetable").header("Origin", "http://localhost:5173")
                .header("Authorization", "Bearer synthetic-token")
                .file(new MockMultipartFile("metadata", new byte[2001]))
                .file(new MockMultipartFile("image", new byte[]{1})))) .andExpect(status().isPayloadTooLarge());
        verifyNoInteractions(images, courses);
    }

    @Test void notFoundAndStaleRevisionErrorsAreNotCacheable() throws Exception {
        when(images.image(1L, 1)).thenThrow(new ResponseStatusException(HttpStatus.NOT_FOUND, "课表已更换"));
        when(courses.checked(1L, 1)).thenThrow(new ResponseStatusException(HttpStatus.CONFLICT, "课表已更新"));
        protectedResponse(mvc.perform(get("/api/timetable/image?revision=1&userId=2")
                .header("Authorization", "Bearer synthetic-token"))).andExpect(status().isNotFound());
        protectedResponse(mvc.perform(post("/api/timetable/courses/checked?revision=1&userId=2")
                .header("Authorization", "Bearer synthetic-token"))).andExpect(status().isConflict());
        verify(images).image(1L, 1);
        verify(courses).checked(1L, 1);
    }

    @Test void infrastructureFailureDoesNotEchoPrivatePayloadOrSql() throws Exception {
        when(courses.save(eq(1L), any())).thenThrow(new IllegalStateException("SELECT courses_json; synthetic-private-marker"));
        protectedResponse(mvc.perform(put("/api/timetable/courses").header("Authorization", "Bearer synthetic-token")
                .contentType("application/json").content("{\"revision\":0,\"semester\":\"synthetic-private-semester\",\"firstMonday\":\"2026-09-07\",\"remindDays\":7,\"courses\":[]}")))
                .andExpect(status().isInternalServerError())
                .andExpect(content().string(not(containsString("SELECT"))))
                .andExpect(content().string(not(containsString("synthetic-private"))));
    }

    @Test void refreshCookieAloneIsNotPrivateApiAuthorization() throws Exception {
        protectedResponse(mvc.perform(get("/api/timetable/courses").cookie(new Cookie("campthink_refresh", "synthetic-value"))))
                .andExpect(status().isUnauthorized());
        verifyNoInteractions(images, courses);
    }
}
