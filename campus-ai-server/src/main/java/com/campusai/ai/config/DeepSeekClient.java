package com.campusai.ai.client;

import com.campusai.ai.model.AiChatMessage;
import com.campusai.ai.model.AiModelResult;
import com.campusai.ai.model.AiModelProfile;
import com.campusai.exception.AiModelException;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonInclude;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.function.Consumer;

@Component
public class DeepSeekClient implements AiModelClient {

    private final RestClient restClient;
    private final Integer maxTokens;
    private final ObjectMapper objectMapper;

    public DeepSeekClient(
            @Qualifier("deepSeekRestClient")
            RestClient restClient,
            @Value("${app.ai.deepseek.max-tokens}")
            Integer maxTokens,
            ObjectMapper objectMapper) {

        this.restClient = restClient;
        this.maxTokens = maxTokens;
        this.objectMapper = objectMapper;
    }

    @Override
    public AiModelResult chat(
            List<AiChatMessage> messages,
            AiModelProfile profile) {

        DeepSeekRequest request =
                new DeepSeekRequest(
                        profile.getApiModel(),
                        messages,
                        new Thinking(profile.getThinkingType()),
                        Math.min(
                                profile.getMaxOutputTokens(),
                                maxTokens
                        ),
                        null,
                        null
                );

        try {
            DeepSeekResponse response = restClient
                    .post()
                    .uri("/chat/completions")
                    .body(request)
                    .retrieve()
                    .body(DeepSeekResponse.class);

            if (response == null
                    || response.choices() == null
                    || response.choices().isEmpty()
                    || response.choices().get(0).message() == null
                    || response.choices().get(0)
                    .message().content() == null) {

                throw new AiModelException(
                        "DeepSeek没有返回有效回答"
                );
            }

            Usage usage = response.usage();

            return new AiModelResult(
                    "deepseek",
                    // Record the billed request tier, not a potentially generic response alias.
                    profile.getApiModel(),
                    response.choices()
                            .get(0)
                            .message()
                            .content(),
                    usage == null
                            ? null
                            : usage.promptTokens(),
                    usage == null
                            ? null
                            : usage.completionTokens(),
                    usage == null
                            ? null
                            : usage.totalTokens()
            );

        } catch (RestClientException exception) {
            throw new AiModelException(
                    "DeepSeek服务调用失败",
                    exception
            );
        }
    }

    @Override
    public AiModelResult streamChat(
            List<AiChatMessage> messages,
            AiModelProfile profile,
            Consumer<String> onDelta) {

        DeepSeekRequest request = new DeepSeekRequest(
                profile.getApiModel(),
                messages,
                new Thinking(profile.getThinkingType()),
                Math.min(profile.getMaxOutputTokens(), maxTokens),
                true,
                new StreamOptions(true)
        );

        try {
            return restClient
                    .post()
                    .uri("/chat/completions")
                    .body(request)
                    .exchange((clientRequest, clientResponse) -> {
                        if (clientResponse.getStatusCode().isError()) {
                            throw new AiModelException(
                                    "DeepSeek流式服务返回异常："
                                            + clientResponse.getStatusCode().value()
                            );
                        }

                        return readStream(clientResponse, profile.getApiModel(), onDelta);
                    });
        } catch (RestClientException exception) {
            throw new AiModelException(
                    "DeepSeek流式服务调用失败",
                    exception
            );
        }
    }

    private AiModelResult readStream(
            org.springframework.http.client.ClientHttpResponse response,
            String requestedModel,
            Consumer<String> onDelta) {

        StringBuilder content = new StringBuilder();
        Usage finalUsage = null;

        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(
                        response.getBody(),
                        StandardCharsets.UTF_8
                ))) {

            String line;
            while ((line = reader.readLine()) != null) {
                if (!line.startsWith("data:")) {
                    continue;
                }

                String payload = line.substring(5).trim();
                if (payload.isEmpty()) {
                    continue;
                }
                if ("[DONE]".equals(payload)) {
                    break;
                }

                JsonNode chunk = objectMapper.readTree(payload);
                JsonNode usageNode = chunk.get("usage");
                if (usageNode != null && !usageNode.isNull()) {
                    finalUsage = new Usage(
                            intValueOrNull(usageNode, "prompt_tokens"),
                            intValueOrNull(usageNode, "completion_tokens"),
                            intValueOrNull(usageNode, "total_tokens")
                    );
                }

                JsonNode choices = chunk.path("choices");
                if (!choices.isArray() || choices.isEmpty()) {
                    continue;
                }

                JsonNode deltaNode = choices.get(0)
                        .path("delta")
                        .path("content");

                if (deltaNode.isTextual()
                        && !deltaNode.asText().isEmpty()) {
                    String delta = deltaNode.asText();
                    content.append(delta);
                    onDelta.accept(delta);
                }
            }
        } catch (IOException exception) {
            throw new AiModelException(
                    "读取DeepSeek流式回答失败",
                    exception
            );
        }

        if (content.isEmpty()) {
            throw new AiModelException("DeepSeek没有返回有效回答");
        }

        return new AiModelResult(
                "deepseek",
                requestedModel,
                content.toString(),
                finalUsage == null ? null : finalUsage.promptTokens(),
                finalUsage == null ? null : finalUsage.completionTokens(),
                finalUsage == null ? null : finalUsage.totalTokens()
        );
    }

    private Integer intValueOrNull(
            JsonNode node,
            String fieldName) {

        JsonNode value = node.get(fieldName);
        return value == null || value.isNull()
                ? null
                : value.asInt();
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    private record DeepSeekRequest(
            String model,
            List<AiChatMessage> messages,
            Thinking thinking,
            @JsonProperty("max_tokens")
            Integer maxTokens,
            Boolean stream,
            @JsonProperty("stream_options")
            StreamOptions streamOptions
    ) {
    }

    private record StreamOptions(
            @JsonProperty("include_usage")
            boolean includeUsage
    ) {
    }

    private record Thinking(
            String type
    ) {
    }

    private record DeepSeekResponse(
            String model,
            List<Choice> choices,
            Usage usage
    ) {
    }

    private record Choice(
            ResponseMessage message
    ) {
    }

    private record ResponseMessage(
            String role,
            String content
    ) {
    }

    private record Usage(
            @JsonProperty("prompt_tokens")
            Integer promptTokens,

            @JsonProperty("completion_tokens")
            Integer completionTokens,

            @JsonProperty("total_tokens")
            Integer totalTokens
    ) {
    }
}
