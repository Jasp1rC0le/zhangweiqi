package com.campusai.knowledge.importing;

import org.junit.jupiter.api.Test;
import java.io.IOException;
import java.net.ConnectException;
import java.net.UnknownHostException;
import java.net.http.HttpConnectTimeoutException;
import java.net.http.HttpTimeoutException;
import javax.net.ssl.SSLHandshakeException;
import static org.assertj.core.api.Assertions.assertThat;

class KnowledgeSourceReadFailureTest {
    @Test void distinguishesConnectionTimeoutFromNoResponse() {
        var connect=KnowledgeImportPreviewService.sourceReadFailure(new HttpConnectTimeoutException("private detail"));
        var response=KnowledgeImportPreviewService.sourceReadFailure(new HttpTimeoutException("private detail"));
        assertThat(connect.getStatusCode().value()).isEqualTo(504);
        assertThat(connect.getReason()).isEqualTo("连接官网超时，未取得网页内容");
        assertThat(response.getStatusCode().value()).isEqualTo(504);
        assertThat(response.getReason()).isEqualTo("官网响应超时，未取得网页内容");
    }
    @Test void diagnosesWrappedDnsAndTlsWithoutExposingDetailsOrWeakeningTls() {
        for (var row : new Object[][] {
                {new UnknownHostException("private host"),"官网域名解析失败"},
                {new SSLHandshakeException("private certificate"),"官网安全连接校验失败，未降低安全校验"},
                {new ConnectException("private address"),"无法连接官网，请检查来源地址或网络"}}) {
            var failure=KnowledgeImportPreviewService.sourceReadFailure(new IOException("private wrapper",(Exception)row[0]));
            assertThat(failure.getStatusCode().value()).isEqualTo(502);
            assertThat(failure.getReason()).isEqualTo(row[1]).doesNotContain("private");
        }
    }
    @Test void unknownTransportFailureHasSafeActionableMessage() {
        var failure=KnowledgeImportPreviewService.sourceReadFailure(new IOException("token=private"));
        assertThat(failure.getStatusCode().value()).isEqualTo(502);
        assertThat(failure.getReason()).isEqualTo("官网连接中断，未取得完整网页内容");
    }
}
