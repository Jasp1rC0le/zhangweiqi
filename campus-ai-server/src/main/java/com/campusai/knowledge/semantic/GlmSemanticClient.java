package com.campusai.knowledge.semantic;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Component
public class GlmSemanticClient {
    private final RestClient client;
    private final ObjectMapper json;
    private final String apiKey;
    private final String model;
    private final int dimensions;

    public GlmSemanticClient(@Qualifier("glmSemanticRestClient") RestClient client, ObjectMapper json,
                             @Value("${app.knowledge.semantic-api-key:}") String apiKey,
                             @Value("${app.knowledge.embedding-model:embedding-3}") String model,
                             @Value("${app.knowledge.embedding-dimensions:256}") int dimensions) {
        this.client = client;
        this.json = json;
        this.apiKey = apiKey == null ? "" : apiKey.trim();
        this.model = model;
        this.dimensions = dimensions;
    }

    public String model() { return model; }
    public int dimensions() { return dimensions; }
    public boolean configured() { return !apiKey.isBlank(); }

    public List<List<Double>> embed(List<String> texts) {
        if (!configured()) throw new IllegalStateException("未配置 KNOWLEDGE_SEMANTIC_API_KEY");
        if (texts.isEmpty() || texts.size() > 10) throw new IllegalArgumentException("每批最多10条");
        JsonNode response = client.post().uri("/embeddings")
                .body(Map.of("model", model, "input", texts, "dimensions", dimensions))
                .retrieve().body(JsonNode.class);
        if (response == null || !response.path("data").isArray()
                || response.path("data").size() != texts.size()) {
            throw new IllegalStateException("GLM 未返回完整向量");
        }
        List<List<Double>> result = new ArrayList<>(Collections.nCopies(texts.size(), null));
        for (JsonNode item : response.path("data")) {
            int index = item.path("index").asInt(-1);
            JsonNode vector = item.path("embedding");
            if (index < 0 || index >= texts.size() || !vector.isArray()
                    || vector.size() != dimensions || result.get(index) != null) {
                throw new IllegalStateException("GLM 向量维度或顺序异常");
            }
            List<Double> values = new ArrayList<>(dimensions);
            for (JsonNode value : vector) values.add(value.asDouble());
            result.set(index, values);
        }
        if (result.contains(null)) throw new IllegalStateException("GLM 向量缺失");
        return result;
    }

    public Map<Integer, Double> rerank(String query, List<String> texts) {
        if (!configured() || texts.isEmpty()) return Map.of();
        JsonNode response = client.post().uri("/rerank")
                .body(Map.of("model", "rerank", "query", query,
                        "documents", texts, "top_n", texts.size()))
                .retrieve().body(JsonNode.class);
        if (response == null || !response.path("results").isArray()) {
            throw new IllegalStateException("GLM 未返回重排结果");
        }
        Map<Integer, Double> scores = new HashMap<>();
        for (JsonNode result : response.path("results")) {
            int index = result.path("index").asInt(-1);
            if (index >= 0 && index < texts.size()) {
                scores.put(index, result.path("relevance_score").asDouble());
            }
        }
        return scores;
    }

    public String serialize(List<Double> vector) { return json.writeValueAsString(vector); }

    public List<Double> deserialize(String value) {
        JsonNode array = json.readTree(value);
        if (!array.isArray()) return List.of();
        List<Double> result = new ArrayList<>(array.size());
        for (JsonNode entry : array) result.add(entry.asDouble());
        return result;
    }
}
