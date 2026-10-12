package com.campusai.controller;

import com.campusai.dto.CreateMessageRequest;
import com.campusai.service.AiMessageService;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import static org.assertj.core.api.Assertions.*;

class AiMessageControllerSecurityTest {
    @Test void streamNeverEchoesInternalExceptionOrCachesConversation() throws Exception {
        var service=mock(AiMessageService.class);
        when(service.streamChat(eq(1L),eq(2L),any(),any())).thenThrow(
                new org.springframework.dao.DataAccessResourceFailureException("jdbc:mysql://private SECRET_KEY"));
        var response=new AiMessageController(service,new ObjectMapper()).streamChat(1L,2L,new CreateMessageRequest());
        var output=new ByteArrayOutputStream();response.getBody().writeTo(output);
        assertThat(output.toString(StandardCharsets.UTF_8)).contains("event: error").doesNotContain("private","SECRET_KEY","jdbc:");
        assertThat(response.getHeaders().getCacheControl()).isEqualTo("no-store, no-transform");
    }
    @Test void preservesQuotaStatusButRedactsServerErrorReasons() throws Exception {
        var service=mock(AiMessageService.class);
        when(service.streamChat(eq(1L),eq(2L),any(),any())).thenThrow(
                new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.TOO_MANY_REQUESTS,"额度不足"),
                new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.INTERNAL_SERVER_ERROR,"SECRET_INTERNAL"));
        var controller=new AiMessageController(service,new ObjectMapper());
        var output=new ByteArrayOutputStream();controller.streamChat(1L,2L,new CreateMessageRequest()).getBody().writeTo(output);
        assertThat(output.toString(StandardCharsets.UTF_8)).contains("429","额度不足");
        output.reset();controller.streamChat(1L,2L,new CreateMessageRequest()).getBody().writeTo(output);
        assertThat(output.toString(StandardCharsets.UTF_8)).contains("500").doesNotContain("SECRET_INTERNAL");
    }
}
