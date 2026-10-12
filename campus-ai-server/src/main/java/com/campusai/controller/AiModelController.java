package com.campusai.controller;

import com.campusai.ai.model.AiModelProfile;
import com.campusai.dto.ModelOptionResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Arrays;
import java.util.List;

@RestController
@RequestMapping("/api/models")
public class AiModelController {

    private final boolean kimiConfigured;
    private final boolean glmConfigured;
    private final boolean deepSeekConfigured;
    private final com.campusai.ai.usage.AiCostEstimator pricing;
    private final boolean budgetEnabled;

    public AiModelController(String kimiApiKey, String glmApiKey) {
        this(kimiApiKey, glmApiKey, "legacy-test", null, false);
    }

    @org.springframework.beans.factory.annotation.Autowired
    public AiModelController(
            @Value("${app.ai.kimi.api-key:}") String kimiApiKey,
            @Value("${app.ai.glm.api-key:}") String glmApiKey,
            @Value("${app.ai.deepseek.api-key:}") String deepSeekApiKey,
            com.campusai.ai.usage.AiCostEstimator pricing,
            @Value("${app.ai.budget.enabled:false}") boolean budgetEnabled) {
        this.kimiConfigured = kimiApiKey != null && !kimiApiKey.isBlank();
        this.glmConfigured = glmApiKey != null && !glmApiKey.isBlank();
        this.deepSeekConfigured = deepSeekApiKey != null && !deepSeekApiKey.isBlank();
        this.pricing = pricing;
        this.budgetEnabled = budgetEnabled;
    }

    @GetMapping
    public ResponseEntity<List<ModelOptionResponse>> findAll(
            @RequestAttribute("currentUserRole") String currentUserRole) {

        List<ModelOptionResponse> models = Arrays.stream(AiModelProfile.values())
                .map(profile -> ModelOptionResponse.from(
                        profile,
                        currentUserRole,
                        (!budgetEnabled || priced(profile)) && switch (profile) {
                            case KIMI -> kimiConfigured;
                            case GLM -> glmConfigured;
                            default -> deepSeekConfigured;
                        }
                ))
                .toList();

        return ResponseEntity.ok(models);
    }

    private boolean priced(AiModelProfile profile) {
        var estimate = pricing.estimate(profile.getProvider(), profile.getApiModel(), 1_000_000L, 1_000_000L);
        return estimate != null && estimate.signum() > 0;
    }
}
