package com.campusai.ai.config;

import com.campusai.ai.client.AiModelClient;
import com.campusai.ai.client.OpenAiCompatibleClient;
import com.campusai.ai.client.ProviderRoutingAiModelClient;
import com.campusai.ai.client.ResilientAiModelClient;
import com.campusai.ai.client.MeteredAiModelClient;
import com.campusai.ai.usage.AiSpendGuard;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.ObjectMapper;

import java.time.Duration;

@Configuration
public class AiClientConfig {

    @Bean("deepSeekRestClient")
    public RestClient deepSeekRestClient(
            @Value("${app.ai.deepseek.base-url}")
            String baseUrl,

            @Value("${app.ai.deepseek.api-key}")
            String apiKey) {

        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(5));
        factory.setReadTimeout(Duration.ofSeconds(45));
        return RestClient.builder()
                .baseUrl(baseUrl)
                .requestFactory(factory)
                .defaultHeader(
                        HttpHeaders.AUTHORIZATION,
                        "Bearer " + apiKey
                )
                .defaultHeader(
                        HttpHeaders.CONTENT_TYPE,
                        MediaType.APPLICATION_JSON_VALUE
                )
                .build();
    }

    @Bean("kimiRestClient")
    public RestClient kimiRestClient(
            @Value("${app.ai.kimi.base-url}")
            String baseUrl,

            @Value("${app.ai.kimi.api-key}")
            String apiKey) {

        return compatibleRestClient(baseUrl, apiKey);
    }

    @Bean("glmRestClient")
    public RestClient glmRestClient(
            @Value("${app.ai.glm.base-url}")
            String baseUrl,

            @Value("${app.ai.glm.api-key}")
            String apiKey) {

        return compatibleRestClient(baseUrl, apiKey);
    }

    @Bean("glmSemanticRestClient")
    public RestClient glmSemanticRestClient(
            @Value("${app.knowledge.semantic-base-url}") String baseUrl,
            @Value("${app.knowledge.semantic-api-key:}") String apiKey) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(3));
        factory.setReadTimeout(Duration.ofSeconds(12));
        return RestClient.builder().baseUrl(baseUrl).requestFactory(factory)
                .defaultHeader(HttpHeaders.AUTHORIZATION, "Bearer " + (apiKey == null ? "" : apiKey))
                .defaultHeader(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
                .build();
    }

    @Bean("kimiModelClient")
    public AiModelClient kimiModelClient(
            @Qualifier("kimiRestClient")
            RestClient restClient,

            @Value("${app.ai.kimi.api-key}")
            String apiKey,

            @Value("${app.ai.kimi.model}")
            String model,

            @Value("${app.ai.kimi.max-tokens}")
            Integer maxTokens,

            ObjectMapper objectMapper) {

        return new OpenAiCompatibleClient(
                restClient,
                "kimi",
                apiKey,
                model,
                maxTokens,
                objectMapper
        );
    }

    @Bean("glmModelClient")
    public AiModelClient glmModelClient(
            @Qualifier("glmRestClient")
            RestClient restClient,

            @Value("${app.ai.glm.api-key}")
            String apiKey,

            @Value("${app.ai.glm.model}")
            String model,

            @Value("${app.ai.glm.max-tokens}")
            Integer maxTokens,

            ObjectMapper objectMapper) {

        return new OpenAiCompatibleClient(
                restClient,
                "glm",
                apiKey,
                model,
                maxTokens,
                objectMapper
        );
    }

    @Bean
    public AiModelClient routingAiModelClient(
            @Qualifier("deepSeekClient")
            AiModelClient deepSeekClient,
            @Qualifier("kimiModelClient")
            AiModelClient kimiClient,
            @Qualifier("glmModelClient")
            AiModelClient glmClient) {

        return new ProviderRoutingAiModelClient(
                deepSeekClient,
                kimiClient,
                glmClient
        );
    }

    @Bean
    @Primary
    public AiModelClient resilientAiModelClient(
            @Qualifier("deepSeekClient") AiModelClient deepSeekClient,
            @Qualifier("kimiModelClient") AiModelClient kimiClient,
            @Qualifier("glmModelClient") AiModelClient glmClient,
            @Value("${app.ai.max-concurrent:16}") int maxConcurrent,
            @Value("${app.ai.circuit-cooldown-seconds:30}") long cooldownSeconds,
            AiSpendGuard guard,
            @Value("${app.ai.deepseek.api-key:}") String deepSeekKey,
            @Value("${app.ai.kimi.api-key:}") String kimiKey,
            @Value("${app.ai.glm.api-key:}") String glmKey,
            @Value("${app.ai.kimi.model}") String kimiModel,
            @Value("${app.ai.glm.model}") String glmModel,
            @Value("${app.ai.deepseek.max-tokens}") int deepSeekMax,
            @Value("${app.ai.kimi.max-tokens}") int kimiMax,
            @Value("${app.ai.glm.max-tokens}") int glmMax) {
        return new ResilientAiModelClient(
                new MeteredAiModelClient(deepSeekClient, guard, "deepseek", null, deepSeekMax, deepSeekKey),
                new MeteredAiModelClient(kimiClient, guard, "kimi", kimiModel, kimiMax, kimiKey),
                new MeteredAiModelClient(glmClient, guard, "glm", glmModel, glmMax, glmKey),
                maxConcurrent, Duration.ofSeconds(cooldownSeconds));
    }

    private RestClient compatibleRestClient(
            String baseUrl,
            String apiKey) {

        SimpleClientHttpRequestFactory requestFactory =
                new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(Duration.ofSeconds(5));
        requestFactory.setReadTimeout(Duration.ofSeconds(75));

        return RestClient.builder()
                .baseUrl(baseUrl)
                .requestFactory(requestFactory)
                .defaultHeader(
                        HttpHeaders.AUTHORIZATION,
                        "Bearer " + (apiKey == null ? "" : apiKey)
                )
                .defaultHeader(
                        HttpHeaders.CONTENT_TYPE,
                        MediaType.APPLICATION_JSON_VALUE
                )
                .build();
    }
}
