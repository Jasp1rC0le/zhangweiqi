package com.campusai.controller;

import com.campusai.ai.client.ChatStreamingSupport;
import com.campusai.dto.ChatResponse;
import com.campusai.exception.GlobalExceptionHandler;
import com.campusai.security.*;
import com.campusai.service.AiMessageService;
import io.jsonwebtoken.*;
import jakarta.servlet.DispatcherType;
import org.junit.jupiter.api.*;
import org.springframework.http.MediaType;
import org.springframework.mock.web.*;
import org.springframework.test.web.servlet.*;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import tools.jackson.databind.ObjectMapper;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@Timeout(5)
class ChatAsyncBoundaryTest {
    final JwtService jwt=mock(JwtService.class);final AuthSessionService sessions=mock(AuthSessionService.class);
    final AiMessageService service=mock(AiMessageService.class);ChatStreamingSupport support;MockMvc mvc;JwtInterceptor interceptor;
    final String path="/api/conversations/2/messages/stream";
    @BeforeEach void setup(){
        var claims=mock(Claims.class);when(claims.getSubject()).thenReturn("1");when(claims.get("role",String.class)).thenReturn("STUDENT");when(claims.get("sid",String.class)).thenReturn("sid");when(jwt.parseToken("valid")).thenReturn(claims);when(sessions.active("sid",1L,"STUDENT")).thenReturn(true);
        support=new ChatStreamingSupport(new ObjectMapper(),sessions,2,1000,50);interceptor=new JwtInterceptor(jwt,sessions);
        mvc=MockMvcBuilders.standaloneSetup(new AiMessageController(service,support)).setControllerAdvice(new GlobalExceptionHandler()).addFilters(new ApiBoundaryFilter("http://localhost:5173")).addInterceptors(interceptor).build();
    }
    @AfterEach void close(){support.close();}
    @Test void missingAndExpiredBearerReturnJson401EvenWhenBrowserOnlyAcceptsSse() throws Exception {
        when(jwt.parseToken("expired")).thenThrow(new ExpiredJwtException(null,null,"expired"));
        for(String token:List.of("","expired")) {
            var request=post(path).contentType(MediaType.APPLICATION_JSON).accept(MediaType.TEXT_EVENT_STREAM).content("{\"content\":\"合成问题\"}");
            if(!token.isEmpty())request.header("Authorization","Bearer "+token);
            mvc.perform(request).andExpect(status().isUnauthorized()).andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON)).andExpect(header().string("Cache-Control","no-store"));
        }
        verifyNoInteractions(service);
    }
    @Test void completedAsyncDispatchReusesRequestProofNotExpiredBearerButStillChecksRevocation() throws Exception {
        when(service.streamChat(eq(1L),eq(2L),any(),any())).thenAnswer(invocation->{((java.util.function.Consumer<String>)invocation.getArgument(3)).accept("合成回复");return new ChatResponse(null,null,List.of(),List.of());});
        MvcResult result=mvc.perform(post(path).header("Authorization","Bearer valid").contentType(MediaType.APPLICATION_JSON).accept(MediaType.TEXT_EVENT_STREAM).content("{\"content\":\"合成问题\"}")).andExpect(request().asyncStarted()).andReturn();
        result.getAsyncResult(1000);when(jwt.parseToken("valid")).thenThrow(new ExpiredJwtException(null,null,"elapsed"));
        mvc.perform(asyncDispatch(result)).andExpect(status().isOk()).andExpect(content().contentTypeCompatibleWith(MediaType.TEXT_EVENT_STREAM));
        verify(jwt,times(1)).parseToken("valid");assertTrue(result.getResponse().getContentAsString().contains("event: done"));
        when(sessions.active("sid",1L,"STUDENT")).thenReturn(false);
        result.getRequest().setDispatcherType(DispatcherType.ASYNC);assertFalse(interceptor.preHandle(result.getRequest(),result.getResponse(),new Object()));
    }
    @Test void forgedAsyncAndChangedTargetCannotReuseAnotherRequestsProof() throws Exception {
        var req=new MockHttpServletRequest("POST",path);var res=new MockHttpServletResponse();
        req.setDispatcherType(DispatcherType.ASYNC);req.setAttribute("currentUserId",1L);req.addHeader("Authorization","Bearer valid");
        assertThrows(com.campusai.exception.UnauthorizedException.class,()->interceptor.preHandle(req,res,new Object()));
        req.setDispatcherType(DispatcherType.REQUEST);assertTrue(interceptor.preHandle(req,res,new Object()));
        req.setDispatcherType(DispatcherType.ASYNC);req.setRequestURI("/api/admin/overview");
        assertThrows(com.campusai.exception.UnauthorizedException.class,()->interceptor.preHandle(req,res,new Object()));
    }
}
