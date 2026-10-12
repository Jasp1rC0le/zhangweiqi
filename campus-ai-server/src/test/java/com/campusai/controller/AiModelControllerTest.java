package com.campusai.controller;

import com.campusai.dto.ModelOptionResponse;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class AiModelControllerTest {

    @Test
    void freeBudgetModeRequiresBothConfiguredProviderAndPrices() {
        var prices = new com.campusai.ai.usage.AiCostEstimator("2", "8", "", "", "", "", "8", "28");
        var models = new AiModelController("test-kimi-key", "test-glm-key", "test-deepseek-key", prices, true)
                .findAll("ADMIN").getBody();
        assertThat(models).filteredOn(option -> option.key().equals("kimi") || option.key().equals("pro"))
                .allMatch(option -> !option.available() && !option.configured());
        assertThat(models).filteredOn(option -> option.key().equals("standard") || option.key().equals("glm"))
                .allMatch(ModelOptionResponse::available);
    }

    private final AiModelController controller =
            new AiModelController("test-kimi-key", "test-glm-key");

    @Test
    void shouldExposeProButKeepItLockedForStudent() {
        List<ModelOptionResponse> models =
                controller.findAll("STUDENT").getBody();

        assertThat(models).hasSize(5);
        assertThat(models)
                .filteredOn(ModelOptionResponse::premium)
                .singleElement()
                .extracting(ModelOptionResponse::available)
                .isEqualTo(false);
    }

    @Test
    void shouldAllowAdminToPreviewAllModels() {
        List<ModelOptionResponse> models =
                controller.findAll("ADMIN").getBody();

        assertThat(models)
                .allMatch(ModelOptionResponse::available);
    }

    @Test
    void shouldMarkProviderWithoutKeyAsUnconfigured() {
        List<ModelOptionResponse> models =
                new AiModelController("", "test-glm-key")
                        .findAll("STUDENT")
                        .getBody();

        assertThat(models)
                .filteredOn(option -> option.key().equals("kimi"))
                .singleElement()
                .satisfies(option -> {
                    assertThat(option.configured()).isFalse();
                    assertThat(option.available()).isFalse();
                });
    }
}
