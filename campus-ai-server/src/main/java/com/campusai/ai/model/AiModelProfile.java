package com.campusai.ai.model;

import java.util.Arrays;

public enum AiModelProfile {

    STANDARD(
            "standard",
            "问答",
            "校园资料与日常问答",
            "deepseek",
            "deepseek-v4-flash",
            "disabled",
            20,
            1500,
            false
    ),
    THINKING(
            "thinking",
            "深度思考",
            "适合学习规划与复杂分析",
            "deepseek",
            "deepseek-v4-flash",
            "enabled",
            30,
            2500,
            false
    ),
    PRO(
            "pro",
            "Campus Pro",
            "专注简历、个人介绍与岗位匹配",
            "deepseek",
            "deepseek-v4-pro",
            "enabled",
            50,
            4000,
            true
    ),
    KIMI(
            "kimi",
            "论文",
            "适合论文阅读、写作与长文档整理",
            "kimi",
            "kimi-k3",
            "enabled",
            60,
            6000,
            false
    ),
    GLM(
            "glm",
            "代码",
            "适合代码生成、调试与技术解释",
            "glm",
            "glm-5.3",
            "disabled",
            40,
            5000,
            false
    );

    private final String key;
    private final String displayName;
    private final String description;
    private final String provider;
    private final String apiModel;
    private final String thinkingType;
    private final int historyLimit;
    private final int maxOutputTokens;
    private final boolean premium;

    AiModelProfile(
            String key,
            String displayName,
            String description,
            String provider,
            String apiModel,
            String thinkingType,
            int historyLimit,
            int maxOutputTokens,
            boolean premium) {

        this.key = key;
        this.displayName = displayName;
        this.description = description;
        this.provider = provider;
        this.apiModel = apiModel;
        this.thinkingType = thinkingType;
        this.historyLimit = historyLimit;
        this.maxOutputTokens = maxOutputTokens;
        this.premium = premium;
    }

    public static AiModelProfile fromKey(String key) {
        if (key == null || key.isBlank()) {
            return STANDARD;
        }

        return Arrays.stream(values())
                .filter(profile -> profile.key.equalsIgnoreCase(key.trim()))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("不支持的模型档位"));
    }

    public boolean isAvailableTo(String role) {
        return !premium || "ADMIN".equals(role);
    }

    public String getKey() {
        return key;
    }

    public String getDisplayName() {
        return displayName;
    }

    public String getDescription() {
        return description;
    }

    public String getProvider() {
        return provider;
    }

    public String getApiModel() {
        return apiModel;
    }

    public String getThinkingType() {
        return thinkingType;
    }

    public int getHistoryLimit() {
        return historyLimit;
    }

    public int getMaxOutputTokens() {
        return maxOutputTokens;
    }

    public boolean isPremium() {
        return premium;
    }
}
