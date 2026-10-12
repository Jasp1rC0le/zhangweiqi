package com.campusai.search;

import com.campusai.search.model.WebSearchResult;
import com.fasterxml.jackson.annotation.JsonProperty;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.util.List;

@Service
public class BochaWebSearchService implements WebSearchService {

    private static final Logger log = LoggerFactory.getLogger(
            BochaWebSearchService.class
    );

    private final RestClient restClient;
    private final String apiKey;
    private final boolean enabled;
    private final int maxResults;

    @Autowired
    public BochaWebSearchService(
            @Value("${app.web-search.base-url:https://api.bochaai.com}")
            String baseUrl,
            @Value("${app.web-search.api-key:}")
            String apiKey,
            @Value("${app.web-search.enabled:true}")
            boolean enabled,
            @Value("${app.web-search.max-results:5}")
            int maxResults) {

        this(buildRestClient(baseUrl), apiKey, enabled, maxResults);
    }

    BochaWebSearchService(
            RestClient restClient,
            String apiKey,
            boolean enabled,
            int maxResults) {

        this.restClient = restClient;
        this.apiKey = apiKey == null ? "" : apiKey.trim();
        this.enabled = enabled;
        this.maxResults = Math.max(1, Math.min(maxResults, 10));
    }

    private static RestClient buildRestClient(String baseUrl) {
        SimpleClientHttpRequestFactory requestFactory =
                new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(Duration.ofSeconds(3));
        requestFactory.setReadTimeout(Duration.ofSeconds(8));
        return RestClient.builder()
                .baseUrl(baseUrl)
                .requestFactory(requestFactory)
                .build();
    }

    @Override
    public List<WebSearchResult> search(String query) {
        if (!enabled || apiKey.isBlank() || query == null || query.isBlank()) {
            return List.of();
        }

        try {
            BochaResponse response = restClient.post()
                    .uri("/v1/web-search")
                    .header("Authorization", "Bearer " + apiKey)
                    .body(new BochaRequest(
                            query.trim(),
                            "noLimit",
                            true,
                            maxResults
                    ))
                    .retrieve()
                    .body(BochaResponse.class);

            BochaWebPages pages = response == null
                    ? null
                    : response.webPages() != null
                    ? response.webPages()
                    : response.data() == null
                    ? null
                    : response.data().webPages();
            if (pages == null || pages.value() == null) {
                return List.of();
            }

            return pages.value().stream()
                    .filter(result -> result != null
                            && result.name() != null
                            && result.url() != null)
                    .map(result -> new WebSearchResult(
                            result.name().trim(),
                            result.url().trim(),
                            selectSummary(result),
                            result.datePublished()
                    ))
                    .filter(result -> !result.title().isBlank()
                            && !result.url().isBlank()
                            && !result.content().isBlank())
                    .toList();
        } catch (RuntimeException exception) {
            log.warn("博查网页搜索失败，降级为本地知识库：{}", exception.getMessage());
            return List.of();
        }
    }

    @Override
    public boolean isAvailable() {
        return enabled && !apiKey.isBlank();
    }

    private String selectSummary(BochaItem result) {
        if (result.summary() != null && !result.summary().isBlank()) {
            return result.summary().trim();
        }
        return result.snippet() == null ? "" : result.snippet().trim();
    }

    private record BochaRequest(
            String query,
            String freshness,
            boolean summary,
            int count
    ) {
    }

    private record BochaResponse(
            BochaData data,
            @JsonProperty("webPages")
            BochaWebPages webPages
    ) {
    }

    private record BochaData(
            @JsonProperty("webPages")
            BochaWebPages webPages
    ) {
    }

    private record BochaWebPages(
            List<BochaItem> value
    ) {
    }

    private record BochaItem(
            String name,
            String url,
            String snippet,
            String summary,
            @JsonProperty("datePublished")
            String datePublished
    ) {
    }
}
