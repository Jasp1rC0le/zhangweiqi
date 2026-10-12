package com.campusai.dto;

import java.time.LocalDateTime;
import java.util.List;

public record UserProfileResponse(
        Long userId,
        String major,
        String grade,
        List<String> skills,
        String careerDirection,
        String bio,
        LocalDateTime updatedAt) {
}
