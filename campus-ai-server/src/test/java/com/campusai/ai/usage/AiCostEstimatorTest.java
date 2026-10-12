package com.campusai.ai.usage;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;

class AiCostEstimatorTest {
    @Test
    void calculatesUsingConfiguredPerMillionRates() {
        AiCostEstimator estimator = new AiCostEstimator("2", "8", "", "", "", "", "", "");
        assertThat(estimator.estimate("deepseek", "deepseek-v4-flash", 1_000_000L, 500_000L))
                .isEqualByComparingTo(new BigDecimal("6.000000"));
    }

    @Test
    void missingPriceOrTokensIsUnknownNotZero() {
        AiCostEstimator estimator = new AiCostEstimator("", "", "", "", "", "", "", "");
        assertThat(estimator.estimate("deepseek", "flash", 100L, 200L)).isNull();
        assertThat(estimator.estimate("glm", "glm-5.3", null, 200L)).isNull();
    }

    @Test
    void unknownDeepSeekModelIsNotMispricedAsFlash() {
        AiCostEstimator estimator = new AiCostEstimator("2", "8", "", "", "", "", "", "");
        assertThat(estimator.estimate("deepseek", "new-model", 100L, 200L)).isNull();
    }
}
