package com.campusai.timetable;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.server.ResponseStatusException;

import java.net.SocketTimeoutException;
import java.nio.charset.StandardCharsets;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

class TimetableVisionDiagnosticsTest {
    private RuntimeException http(HttpStatus status, String body) {
        var headers = new HttpHeaders(); headers.setBearerAuth("SECRET_HEADER");
        return HttpClientErrorException.create(status, "SECRET_STATUS_TEXT", headers, body.getBytes(StandardCharsets.UTF_8), StandardCharsets.UTF_8);
    }
    @Test void classifiesProviderRejectionUsingOnlyKnownCodeAndParameter() {
        var detail = TimetableVisionDiagnostics.classify(http(HttpStatus.BAD_REQUEST,"{\"error\":{\"type\":\"invalid_request_error\",\"message\":\"max_completion_tokens rejected SECRET_IMAGE\"}}"));
        assertThat(detail).isEqualTo(new TimetableVisionDiagnostics.Detail("UPSTREAM_REQUEST",400,"invalid_request_error","max_completion_tokens"));
    }
    @Test void rejectsArbitraryProviderErrorFieldsAndOversizedBodies() {
        for(String body : new String[]{"{\"error\":{\"type\":\"SECRET_KEY\",\"code\":\"SECRET_KEY\",\"param\":\"SECRET_IMAGE\",\"message\":\"PRIVATE_TEXT\"}}", "SECRET".repeat(4000), "not json SECRET"}) {
            var d=TimetableVisionDiagnostics.classify(http(HttpStatus.BAD_REQUEST,body));
            assertThat(d.providerCode()).isEqualTo("unrecognized"); assertThat(d.field()).isEqualTo("unspecified");
        }
    }
    @Test void permissionAndRateLimitAreDistinctAndDoNotExposeRawBody() {
        assertThat(TimetableVisionDiagnostics.classify(http(HttpStatus.UNAUTHORIZED,"SECRET")).category()).isEqualTo("AUTHORIZATION");
        assertThat(TimetableVisionDiagnostics.classify(http(HttpStatus.FORBIDDEN,"SECRET")).category()).isEqualTo("AUTHORIZATION");
        assertThat(TimetableVisionDiagnostics.classify(http(HttpStatus.TOO_MANY_REQUESTS,"SECRET")).category()).isEqualTo("RATE_LIMIT");
    }
    @Test void model404ExplainsModelAvailabilityWithoutClaimingAccountWasNotFunded() {
        var failure=http(HttpStatus.NOT_FOUND,"{\"error\":{\"type\":\"resource_not_found_error\",\"message\":\"model not found SECRET\"}}");
        assertThat(TimetableVisionDiagnostics.classify(failure)).isEqualTo(new TimetableVisionDiagnostics.Detail("MODEL_UNAVAILABLE",404,"resource_not_found_error","model"));
        assertThat(TimetableVisionDiagnostics.failure(TimetableVisionDiagnostics.Phase.RECOGNIZE,failure).getReason())
                .contains("模型不存在或账号无访问权限","HTTP 404").doesNotContain("SECRET","未充值","余额不足");
    }
    @Test void timeoutAndUnknownFailuresNeverReuseExceptionMessages() {
        var timeout=new ResourceAccessException("SECRET_URL",new SocketTimeoutException("SECRET_BODY"));
        assertThat(TimetableVisionDiagnostics.classify(timeout).category()).isEqualTo("TRANSPORT_TIMEOUT");
        assertThat(TimetableVisionDiagnostics.classify(new RestClientException("SECRET"))).isEqualTo(new TimetableVisionDiagnostics.Detail("UNEXPECTED",0,"none","none"));
    }
    @Test void logsClosedVocabularyWithoutImageKeyHeaderOrThrowable() {
        Logger logger=(Logger)LoggerFactory.getLogger(TimetableVisionDiagnostics.class);
        var appender=new ListAppender<ILoggingEvent>();appender.start();logger.addAppender(appender);
        try {
            var response=TimetableVisionDiagnostics.failure(TimetableVisionDiagnostics.Phase.RECOGNIZE,http(HttpStatus.BAD_REQUEST,"{\"error\":{\"type\":\"invalid_request_error\",\"message\":\"response_format SECRET_IMAGE Bearer SECRET_KEY\"}}"));
            assertThat(response.getReason()).contains("HTTP 400","诊断").doesNotContain("SECRET","Bearer","response_format");
            assertThat(response.getCause()).isNull();assertThat(appender.list).hasSize(1);
            assertThat(appender.list.get(0).getFormattedMessage()).contains("phase=RECOGNIZE","httpStatus=400","field=response_format").doesNotContain("SECRET","Bearer");
            assertThat(appender.list.get(0).getThrowableProxy()).isNull();
        } finally {logger.detachAppender(appender);appender.stop();}
    }
    @Test void recognizerMakesOneRejectedRequestAndReportsSafeDiagnostic() {
        var builder=RestClient.builder().baseUrl("https://vision.example.test/v1");var server=MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo("https://vision.example.test/v1/chat/completions")).andRespond(withStatus(HttpStatus.BAD_REQUEST).contentType(MediaType.APPLICATION_JSON).body("{\"error\":{\"type\":\"invalid_request_error\",\"param\":\"response_format\",\"message\":\"SECRET\"}}"));
        var model=new KimiTimetableVisionModel(builder.build(),"synthetic-key","kimi-k3","https://vision.example.test/v1",6000);
        assertThatThrownBy(()->model.recognize(new byte[]{1,2,3},"image/png")).isInstanceOf(ResponseStatusException.class).hasMessageContaining("HTTP 400").hasMessageNotContaining("SECRET");server.verify();
    }
}
