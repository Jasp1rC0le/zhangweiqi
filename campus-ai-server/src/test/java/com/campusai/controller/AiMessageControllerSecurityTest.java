package com.campusai.controller;

import com.campusai.dto.CreateMessageRequest;
import com.campusai.service.AiMessageService;
import com.campusai.ai.client.ChatStreamingSupport;
import com.campusai.security.AuthSessionService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import static org.assertj.core.api.Assertions.*;

class AiMessageControllerSecurityTest {
    private final AuthSessionService sessions=mock(AuthSessionService.class);
    private final ChatStreamingSupport streams=new ChatStreamingSupport(new ObjectMapper(),sessions,2,1000,100);
    @AfterEach void close(){streams.close();}
    @Test void streamNeverEchoesInternalExceptionOrCachesConversation() throws Exception {
        when(sessions.active("sid",1L,"STUDENT")).thenReturn(true);
        var service=mock(AiMessageService.class);
        when(service.streamChat(eq(1L),eq(2L),any(),any())).thenThrow(
                new org.springframework.dao.DataAccessResourceFailureException("jdbc:mysql://private SECRET_KEY"));
        var response=new AiMessageController(service,streams).streamChat(1L,2L,new CreateMessageRequest(),"sid","STUDENT");
        var output=new ByteArrayOutputStream();response.getBody().writeTo(output);
        assertThat(output.toString(StandardCharsets.UTF_8)).contains("event: error").doesNotContain("private","SECRET_KEY","jdbc:");
        assertThat(response.getHeaders().getCacheControl()).isEqualTo("no-store, no-transform");
    }
    @Test void preservesQuotaStatusButRedactsServerErrorReasons() throws Exception {
        when(sessions.active("sid",1L,"STUDENT")).thenReturn(true);
        var service=mock(AiMessageService.class);
        when(service.streamChat(eq(1L),eq(2L),any(),any())).thenThrow(
                new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.TOO_MANY_REQUESTS,"额度不足"),
                new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.INTERNAL_SERVER_ERROR,"SECRET_INTERNAL"));
        var controller=new AiMessageController(service,streams);
        var output=new ByteArrayOutputStream();controller.streamChat(1L,2L,new CreateMessageRequest(),"sid","STUDENT").getBody().writeTo(output);
        assertThat(output.toString(StandardCharsets.UTF_8)).contains("429","额度不足");
        output.reset();controller.streamChat(1L,2L,new CreateMessageRequest(),"sid","STUDENT").getBody().writeTo(output);
        assertThat(output.toString(StandardCharsets.UTF_8)).contains("500").doesNotContain("SECRET_INTERNAL");
    }
}
