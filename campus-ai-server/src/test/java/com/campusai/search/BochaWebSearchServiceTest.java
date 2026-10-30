package com.campusai.search;

import com.campusai.search.model.WebSearchResult;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class BochaWebSearchServiceTest {

    @Test
    void shouldReadTopLevelWebPagesFromOfficialResponse() {
        assertResult("""
                {"webPages":{"value":[{"name":"学校通知",
                    "url":"https://example.edu/notice",
                    "snippet":"通知摘要",
                    "datePublished":"2026-09-20"}]}}
                """);
    }

    @Test
    void shouldReadWrappedWebPagesResponse() {
        assertResult("""
                {"data":{"webPages":{"value":[{"name":"学校通知",
                    "url":"https://example.edu/notice",
                    "snippet":"通知摘要",
                    "datePublished":"2026-09-20"}]}}}
                """);
    }

    @Test
    void unsafeOrInternalSourceLinksAreRejected() {
        for(String link:List.of("javascript:alert(1)","http://127.0.0.1/admin","http://localhost/","https://user:secret@example.edu/","https://[::1]/"))
            assertThat(BochaWebSearchService.safeLink(link)).isFalse();
        assertThat(BochaWebSearchService.safeLink("https://xsgz.tsguas.edu.cn/info/1029/2497.htm")).isTrue();
    }

    private void assertResult(String payload) {
        RestClient.Builder builder = RestClient.builder()
                .baseUrl("https://api.example.test");
        MockRestServiceServer server = MockRestServiceServer
                .bindTo(builder)
                .build();
        server.expect(requestTo("https://api.example.test/v1/web-search"))
                .andRespond(withSuccess(payload, MediaType.APPLICATION_JSON));

        BochaWebSearchService service = new BochaWebSearchService(
                builder.build(),
                "test-key",
                true,
                3
        );

        List<WebSearchResult> results = service.search("学校最新通知");

        assertThat(results).hasSize(1);
        assertThat(results.get(0).title()).isEqualTo("学校通知");
        assertThat(results.get(0).content()).isEqualTo("通知摘要");
        server.verify();
    }
}
