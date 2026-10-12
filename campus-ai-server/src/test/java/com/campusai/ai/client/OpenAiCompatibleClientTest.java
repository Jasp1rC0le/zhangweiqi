package com.campusai.ai.client;

import com.campusai.ai.model.AiChatMessage;
import com.campusai.ai.model.AiModelProfile;
import com.campusai.ai.model.AiModelResult;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.ObjectMapper;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class OpenAiCompatibleClientTest {

    @Test
    void shouldUseK3ThinkingEffortAndCompletionLimit() {
        RestClient.Builder builder = RestClient.builder()
                .baseUrl("https://api.example.test/v1");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo("https://api.example.test/v1/chat/completions"))
                .andExpect(content().json("""
                        {"model":"kimi-k3","stream":false,
                         "reasoning_effort":"high","max_completion_tokens":6000}
                        """))
                .andRespond(withSuccess("""
                        {"model":"kimi-k3","choices":[{"message":{"role":"assistant","content":"摘要"}}]}
                        """, MediaType.APPLICATION_JSON));

        OpenAiCompatibleClient client = new OpenAiCompatibleClient(
                builder.build(), "kimi", "test-key", "kimi-k3", 6000, new ObjectMapper());
        AiModelResult result = client.chat(
                List.of(new AiChatMessage("user", "总结论文")), AiModelProfile.KIMI);

        assertThat(result.content()).isEqualTo("摘要");
        server.verify();
    }

    @Test
    void shouldSupportOpenAiCompatibleStreamingResponse() {
        RestClient.Builder builder = RestClient.builder()
                .baseUrl("https://api.example.test/v1");
        MockRestServiceServer server = MockRestServiceServer
                .bindTo(builder)
                .build();

        String stream = """
                data: {"model":"kimi-k2.6","choices":[{"delta":{"content":"长"}}]}

                data: {"model":"kimi-k2.6","choices":[{"delta":{"content":"文"}}]}

                data: {"model":"kimi-k2.6","choices":[],"usage":{"prompt_tokens":4,"completion_tokens":2,"total_tokens":6}}

                data: [DONE]

                """;

        server.expect(requestTo("https://api.example.test/v1/chat/completions"))
                .andExpect(content().json("""
                        {"model":"kimi-k2.6","stream":true,
                         "thinking":{"type":"enabled"},
                         "stream_options":{"include_usage":true}}
                        """))
                .andRespond(withSuccess(stream, MediaType.TEXT_EVENT_STREAM));

        OpenAiCompatibleClient client = new OpenAiCompatibleClient(
                builder.build(),
                "kimi",
                "test-key",
                "kimi-k2.6",
                4096,
                new ObjectMapper()
        );
        List<String> deltas = new ArrayList<>();

        AiModelResult result = client.streamChat(
                List.of(new AiChatMessage("user", "请整理这份长文档")),
                AiModelProfile.KIMI,
                deltas::add
        );

        assertThat(deltas).containsExactly("长", "文");
        assertThat(result.provider()).isEqualTo("kimi");
        assertThat(result.content()).isEqualTo("长文");
        assertThat(result.totalTokens()).isEqualTo(6);
        server.verify();
    }
}
