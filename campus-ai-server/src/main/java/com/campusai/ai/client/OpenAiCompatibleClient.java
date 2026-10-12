package com.campusai.ai.client;

import com.campusai.ai.model.AiChatMessage;
import com.campusai.ai.model.AiModelProfile;
import com.campusai.ai.model.AiModelResult;
import com.campusai.exception.AiModelException;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.function.Consumer;

/**
 * Kimi and GLM both expose an OpenAI-compatible chat-completions endpoint.
 * Keeping this client provider-neutral prevents provider details from leaking
 * into the conversation service and keeps API keys on the server only.
 */
public final class OpenAiCompatibleClient implements AiModelClient {

    private final RestClient restClient;
    private final String provider;
    private final String apiKey;
    private final String configuredModel;
    private final Integer maxTokens;
    private final ObjectMapper objectMapper;

    public OpenAiCompatibleClient(
            RestClient restClient,
            String provider,
            String apiKey,
            String configuredModel,
            Integer maxTokens,
            ObjectMapper objectMapper) {

        this.restClient = restClient;
        this.provider = provider;
        this.apiKey = apiKey == null ? "" : apiKey.trim();
        this.configuredModel = configuredModel;
        this.maxTokens = maxTokens;
        this.objectMapper = objectMapper;
    }

    @Override
    public AiModelResult chat(
            List<AiChatMessage> messages,
            AiModelProfile profile) {

        ensureConfigured();

        ChatRequest request = new ChatRequest(
                configuredModel,
                messages,
                "kimi".equals(provider) ? null : limitTokens(profile),
                "kimi".equals(provider) ? limitTokens(profile) : null,
                false,
                thinkingFor(profile),
                reasoningEffort(),
                null
        );

        try {
            ChatResponse response = restClient
                    .post()
                    .uri("/chat/completions")
                    .body(request)
                    .retrieve()
                    .body(ChatResponse.class);

            if (response == null
                    || response.choices() == null
                    || response.choices().isEmpty()
                    || response.choices().get(0).message() == null
                    || response.choices().get(0).message().content() == null) {
                throw new AiModelException(
                        providerName() + "没有返回有效回答"
                );
            }

            Usage usage = response.usage();
            return new AiModelResult(
                    provider,
                    response.model() == null
                            ? configuredModel
                            : response.model(),
                    response.choices().get(0).message().content(),
                    usage == null ? null : usage.promptTokens(),
                    usage == null ? null : usage.completionTokens(),
                    usage == null ? null : usage.totalTokens()
            );
        } catch (RestClientException exception) {
            throw new AiModelException(
                    providerName() + "服务调用失败，请检查API地址、模型名和Key",
                    exception
            );
        }
    }

    @Override
    public AiModelResult streamChat(
            List<AiChatMessage> messages,
            AiModelProfile profile,
            Consumer<String> onDelta) {

        ensureConfigured();

        ChatRequest request = new ChatRequest(
                configuredModel,
                messages,
                "kimi".equals(provider) ? null : limitTokens(profile),
                "kimi".equals(provider) ? limitTokens(profile) : null,
                true,
                thinkingFor(profile),
                reasoningEffort(),
                "kimi".equals(provider) ? new StreamOptions(true) : null
        );

        try {
            return restClient
                    .post()
                    .uri("/chat/completions")
                    .body(request)
                    .exchange((clientRequest, clientResponse) -> {
                        if (clientResponse.getStatusCode().isError()) {
                            throw new AiModelException(
                                    providerName() + "流式服务返回异常："
                                            + clientResponse.getStatusCode().value()
                            );
                        }
                        return readStream(clientResponse, onDelta);
                    });
        } catch (RestClientException exception) {
            throw new AiModelException(
                    providerName() + "流式服务调用失败，请检查API地址、模型名和Key",
                    exception
            );
        }
    }

    private int limitTokens(AiModelProfile profile) {
        return Math.min(profile.getMaxOutputTokens(), maxTokens);
    }

    private Thinking thinkingFor(AiModelProfile profile) {
        return "kimi".equals(provider) && !"kimi-k3".equals(configuredModel)
                ? new Thinking(profile.getThinkingType())
                : null;
    }

    private String reasoningEffort() {
        return "kimi".equals(provider) && "kimi-k3".equals(configuredModel)
                ? "high" : null;
    }

    private void ensureConfigured() {
        if (apiKey.isBlank()) {
            throw new AiModelException(
                    providerName() + " API Key未配置，请在IDEA运行配置中设置"
                            + ("kimi".equals(provider)
                            ? " KIMI_API_KEY"
                            : " GLM_API_KEY")
            );
        }
        if (configuredModel == null || configuredModel.isBlank()) {
            throw new AiModelException(
                    providerName() + "模型名未配置"
            );
        }
    }

    private String providerName() {
        return "kimi".equals(provider) ? "Kimi" : "GLM";
    }

    private AiModelResult readStream(
            org.springframework.http.client.ClientHttpResponse response,
            Consumer<String> onDelta) {

        StringBuilder content = new StringBuilder();
        String responseModel = null;
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
                if (chunk.hasNonNull("model")) {
                    responseModel = chunk.get("model").asText();
                }

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
                    "读取" + providerName() + "流式回答失败",
                    exception
            );
        }

        if (content.isEmpty()) {
            throw new AiModelException(
                    providerName() + "没有返回有效回答"
            );
        }

        return new AiModelResult(
                provider,
                responseModel == null ? configuredModel : responseModel,
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
    private record ChatRequest(
            String model,
            List<AiChatMessage> messages,
            @JsonProperty("max_tokens")
            Integer maxTokens,
            @JsonProperty("max_completion_tokens")
            Integer maxCompletionTokens,
            Boolean stream,
            Thinking thinking,
            @JsonProperty("reasoning_effort")
            String reasoningEffort,
            @JsonProperty("stream_options")
            StreamOptions streamOptions
    ) {
    }

    private record Thinking(String type) {
    }

    private record StreamOptions(
            @JsonProperty("include_usage")
            boolean includeUsage
    ) {
    }

    private record ChatResponse(
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
