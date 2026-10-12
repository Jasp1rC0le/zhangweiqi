package com.campusai.dto;

import jakarta.validation.constraints.Size;

import java.util.List;

public record UserProfileRequest(
        @Size(max = 100) String major,
        @Size(max = 50) String grade,
        @Size(max = 20) List<@Size(max = 40) String> skills,
        @Size(max = 200) String careerDirection,
        @Size(max = 500) String bio) {
}
