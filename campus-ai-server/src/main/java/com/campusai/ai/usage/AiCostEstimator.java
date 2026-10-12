package com.campusai.ai.usage;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;

/** Estimates CNY cost using operator-configured prices per one million tokens. */
@Component
public class AiCostEstimator {
    private final Rates deepSeekFlash;
    private final Rates deepSeekPro;
    private final Rates kimi;
    private final Rates glm;

    public AiCostEstimator(
            @Value("${app.ai.pricing.deepseek-flash-input:}") String flashInput,
            @Value("${app.ai.pricing.deepseek-flash-output:}") String flashOutput,
            @Value("${app.ai.pricing.deepseek-pro-input:}") String proInput,
            @Value("${app.ai.pricing.deepseek-pro-output:}") String proOutput,
            @Value("${app.ai.pricing.kimi-input:}") String kimiInput,
            @Value("${app.ai.pricing.kimi-output:}") String kimiOutput,
            @Value("${app.ai.pricing.glm-input:}") String glmInput,
            @Value("${app.ai.pricing.glm-output:}") String glmOutput) {
        deepSeekFlash = new Rates(parse(flashInput), parse(flashOutput));
        deepSeekPro = new Rates(parse(proInput), parse(proOutput));
        kimi = new Rates(parse(kimiInput), parse(kimiOutput));
        glm = new Rates(parse(glmInput), parse(glmOutput));
    }

    public BigDecimal estimate(String provider, String model, Long inputTokens, Long outputTokens) {
        if (inputTokens == null || outputTokens == null || inputTokens < 0 || outputTokens < 0) return null;
        Rates rates = switch (provider == null ? "" : provider) {
            case "deepseek" -> model != null && model.contains("pro") ? deepSeekPro
                    : model != null && model.contains("flash") ? deepSeekFlash : new Rates(null, null);
            case "kimi" -> kimi;
            case "glm" -> glm;
            default -> new Rates(null, null);
        };
        if (rates.input() == null || rates.output() == null) return null;
        return rates.input().multiply(BigDecimal.valueOf(inputTokens))
                .add(rates.output().multiply(BigDecimal.valueOf(outputTokens)))
                .divide(BigDecimal.valueOf(1_000_000), 6, RoundingMode.HALF_UP);
    }

    private BigDecimal parse(String value) {
        if (value == null || value.isBlank()) return null;
        BigDecimal price = new BigDecimal(value.trim());
        if (price.signum() < 0) throw new IllegalArgumentException("Token单价不能为负数");
        return price;
    }

    private record Rates(BigDecimal input, BigDecimal output) {}
}
