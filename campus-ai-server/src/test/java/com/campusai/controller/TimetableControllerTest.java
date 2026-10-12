package com.campusai.controller;
import com.campusai.exception.GlobalExceptionHandler;
import com.campusai.security.AuthSessionService;
import com.campusai.security.JwtInterceptor;
import com.campusai.security.JwtService;
import com.campusai.timetable.TimetableService;
import io.jsonwebtoken.Claims;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.springframework.http.HttpMethod;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import tools.jackson.databind.ObjectMapper;
import java.time.LocalDate;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
@Timeout(10)
class TimetableControllerTest {
    TimetableService service=mock(TimetableService.class);
    JwtService jwt=mock(JwtService.class); AuthSessionService sessions=mock(AuthSessionService.class);
    ObjectMapper json=new ObjectMapper(); MockMvc mvc;
    @BeforeEach void setup() {
        Claims claims=mock(Claims.class); when(claims.getSubject()).thenReturn("1"); when(claims.get("role",String.class)).thenReturn("STUDENT"); when(claims.get("sid",String.class)).thenReturn("session");
        when(jwt.parseToken("test-token")).thenReturn(claims); when(sessions.active("session",1L,"STUDENT")).thenReturn(true);
        mvc=MockMvcBuilders.standaloneSetup(new TimetableController(service,json)).setControllerAdvice(new GlobalExceptionHandler()).addInterceptors(new JwtInterceptor(jwt,sessions)).build();
    }
    @Test void rejectsAnonymousReadsImagesCheckDeleteAndUpload() throws Exception {
        mvc.perform(get("/api/timetable")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/timetable/image?revision=1")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/timetable/checked?revision=1")).andExpect(status().isUnauthorized());
        mvc.perform(delete("/api/timetable?revision=1")).andExpect(status().isUnauthorized());
        mvc.perform(multipart(HttpMethod.PUT,"/api/timetable").file(new MockMultipartFile("image",new byte[]{1})).file(new MockMultipartFile("metadata","{}".getBytes()))).andExpect(status().isUnauthorized());
        verifyNoInteractions(service);
    }
    @Test void privateResponsesUseSessionOwnerAndNoStore() throws Exception {
        when(service.get(1L)).thenReturn(new TimetableService.State(null));
        when(service.image(1L,1)).thenReturn(new TimetableService.Image(new byte[]{1,2},"image/png"));
        mvc.perform(get("/api/timetable?userId=2").header("Authorization","Bearer test-token")).andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store"));
        mvc.perform(get("/api/timetable/image?revision=1&userId=2").header("Authorization","Bearer test-token")).andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store")).andExpect(header().string("X-Content-Type-Options","nosniff"));
        verify(service).get(1L); verify(service).image(1L,1);
    }
    @Test void multipartMetadataIsParsedAndOwnerIsNotClientControlled() throws Exception {
        var input=new TimetableService.Input(0,"学期",LocalDate.of(2026,9,7),1,18,7);
        when(service.save(eq(1L),any(),any())).thenReturn(new TimetableService.State(null));
        mvc.perform(multipart(HttpMethod.PUT,"/api/timetable?userId=2").file(new MockMultipartFile("metadata",json.writeValueAsBytes(input))).file(new MockMultipartFile("image","timetable.jpg","image/jpeg",new byte[]{1,2})).header("Authorization","Bearer test-token"))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store"));
        verify(service).save(eq(1L),eq(input),any());
    }
    @Test void malformedAndOversizedPayloadsFailBeforeService() throws Exception {
        mvc.perform(multipart(HttpMethod.PUT,"/api/timetable").file(new MockMultipartFile("metadata","bad".getBytes())).file(new MockMultipartFile("image",new byte[]{1})).header("Authorization","Bearer test-token")).andExpect(status().isBadRequest());
        mvc.perform(multipart(HttpMethod.PUT,"/api/timetable").file(new MockMultipartFile("metadata","{}".getBytes())).file(new MockMultipartFile("image",new byte[TimetableService.MAX_IMAGE_BYTES+1])).header("Authorization","Bearer test-token")).andExpect(status().isPayloadTooLarge());
        verifyNoInteractions(service);
    }
    @Test void privateMutationRoutesUseAuthenticatedOwner() throws Exception {
        when(service.checked(1L,3)).thenReturn(new TimetableService.State(null));
        mvc.perform(post("/api/timetable/checked?revision=3&userId=2").header("Authorization","Bearer test-token")).andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store"));
        mvc.perform(delete("/api/timetable?revision=3&userId=2").header("Authorization","Bearer test-token")).andExpect(status().isNoContent()).andExpect(header().string("Cache-Control","no-store"));
        verify(service).checked(1L,3); verify(service).delete(1L,3);
    }
}
