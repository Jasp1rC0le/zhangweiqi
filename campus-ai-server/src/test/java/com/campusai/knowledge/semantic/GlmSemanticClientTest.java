package com.campusai.knowledge.semantic;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.ObjectMapper;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class GlmSemanticClientTest {
    @Test
    void rejectsMalformedEmbeddingDimensions() {
        RestClient.Builder builder = RestClient.builder().baseUrl("https://example.test/api/paas/v4");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo("https://example.test/api/paas/v4/embeddings"))
                .andExpect(content().json("""
                        {"model":"embedding-3","input":["甲","乙"],"dimensions":256}
                        """))
                .andRespond(withSuccess("""
                        {"data":[{"index":1,"embedding":[2]},{"index":0,"embedding":[1]}]}
                        """, MediaType.APPLICATION_JSON));
        // The response above intentionally has the wrong dimension: validation must reject it.
        GlmSemanticClient client = new GlmSemanticClient(builder.build(), new ObjectMapper(),
                "test-key", "embedding-3", 256);
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> client.embed(List.of("甲", "乙")))
                .isInstanceOf(IllegalStateException.class);
        server.verify();
    }

    @Test
    void mapsRerankScoresByOriginalIndex() {
        RestClient.Builder builder = RestClient.builder().baseUrl("https://example.test/api/paas/v4");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo("https://example.test/api/paas/v4/rerank"))
                .andExpect(content().json("""
                        {"model":"rerank","query":"图书馆","documents":["甲","乙"],"top_n":2}
                        """))
                .andRespond(withSuccess("""
                        {"results":[{"index":1,"relevance_score":0.9},
                                    {"index":0,"relevance_score":0.2}]}
                        """, MediaType.APPLICATION_JSON));
        var client = new GlmSemanticClient(builder.build(), new ObjectMapper(),
                "test-key", "embedding-3", 256);
        assertThat(client.rerank("图书馆", List.of("甲", "乙")))
                .containsEntry(1, 0.9).containsEntry(0, 0.2);
        server.verify();
    }

    @Test
    void cosineUsesNormalizedSimilarity() {
        assertThat(KnowledgeSemanticService.cosine(List.of(1.0, 0.0), List.of(1.0, 0.0)))
                .isEqualTo(1.0);
        assertThat(KnowledgeSemanticService.cosine(List.of(1.0, 0.0), List.of(0.0, 1.0)))
                .isEqualTo(0.0);
    }
}
