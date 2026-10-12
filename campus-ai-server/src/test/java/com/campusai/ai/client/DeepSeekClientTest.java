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
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class DeepSeekClientTest {

    @Test
    void shouldForwardStreamingDeltasAndCollectFinalUsage() {
        RestClient.Builder builder = RestClient.builder()
                .baseUrl("https://api.example.test");
        MockRestServiceServer server = MockRestServiceServer
                .bindTo(builder)
                .build();

        String stream = """
                data: {"model":"deepseek-chat","choices":[{"delta":{"content":"你"}}],"usage":null}

                data: {"model":"deepseek-chat","choices":[{"delta":{"content":"好"}}],"usage":null}

                data: {"model":"deepseek-chat","choices":[],"usage":{"prompt_tokens":4,"completion_tokens":2,"total_tokens":6}}

                data: [DONE]

                """;

        server.expect(requestTo("https://api.example.test/chat/completions"))
                .andRespond(withSuccess(stream, MediaType.TEXT_EVENT_STREAM));

        DeepSeekClient client = new DeepSeekClient(
                builder.build(),
                2048,
                new ObjectMapper()
        );
        List<String> deltas = new ArrayList<>();

        AiModelResult result = client.streamChat(
                List.of(new AiChatMessage("user", "你好")),
                AiModelProfile.STANDARD,
                deltas::add
        );

        assertThat(deltas).containsExactly("你", "好");
        assertThat(result.content()).isEqualTo("你好");
        assertThat(result.model()).isEqualTo(AiModelProfile.STANDARD.getApiModel());
        assertThat(result.promptTokens()).isEqualTo(4);
        assertThat(result.completionTokens()).isEqualTo(2);
        assertThat(result.totalTokens()).isEqualTo(6);
        server.verify();
    }
}
