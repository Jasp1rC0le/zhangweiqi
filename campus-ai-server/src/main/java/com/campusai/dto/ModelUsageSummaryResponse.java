package com.campusai.dto;

import lombok.Data;
import java.math.BigDecimal;

@Data
public class ModelUsageSummaryResponse {

    private String provider;
    private String model;
    private Long requestCount;
    private Long promptTokens;
    private Long completionTokens;
    private Long totalTokens;
    private BigDecimal estimatedCostCny;
}
