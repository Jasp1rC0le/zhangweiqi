package com.campusai.dto;

import com.campusai.ai.model.AiModelProfile;

public record ModelOptionResponse(
        String key,
        String name,
        String description,
        boolean premium,
        boolean available,
        boolean configured) {

    public static ModelOptionResponse from(
            AiModelProfile profile,
            String role,
            boolean configured) {

        return new ModelOptionResponse(
                profile.getKey(),
                profile.getDisplayName(),
                profile.getDescription(),
                profile.isPremium(),
                profile.isAvailableTo(role) && configured,
                configured
        );
    }
}
