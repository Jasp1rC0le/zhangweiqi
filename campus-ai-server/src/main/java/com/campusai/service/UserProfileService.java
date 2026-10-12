package com.campusai.service;

import com.campusai.dto.UserProfileRequest;
import com.campusai.dto.UserProfileResponse;
import tools.jackson.core.JacksonException;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;

@Service
public class UserProfileService {
    private static final TypeReference<List<String>> STRING_LIST = new TypeReference<>() {};

    private final JdbcTemplate jdbc;
    private final ObjectMapper json;

    public UserProfileService(JdbcTemplate jdbc, ObjectMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    public UserProfileResponse find(Long userId) {
        List<UserProfileResponse> rows = jdbc.query("SELECT user_id, major, grade, skills_json, "
                        + "career_direction, bio, updated_at FROM user_profiles WHERE user_id = ?",
                (result, row) -> new UserProfileResponse(
                        result.getLong("user_id"), result.getString("major"), result.getString("grade"),
                        readSkills(result.getString("skills_json")), result.getString("career_direction"),
                        result.getString("bio"), result.getTimestamp("updated_at").toLocalDateTime()), userId);
        return rows.isEmpty() ? new UserProfileResponse(userId, null, null, List.of(), null, null, null)
                : rows.get(0);
    }

    @Transactional
    public UserProfileResponse save(Long userId, UserProfileRequest request) {
        List<String> skills = normalizeSkills(request.skills());
        jdbc.update("INSERT INTO user_profiles (user_id, major, grade, skills_json, career_direction, bio) "
                        + "VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE major = VALUES(major), "
                        + "grade = VALUES(grade), skills_json = VALUES(skills_json), "
                        + "career_direction = VALUES(career_direction), bio = VALUES(bio)",
                userId, clean(request.major()), clean(request.grade()), writeSkills(skills),
                clean(request.careerDirection()), clean(request.bio()));
        return find(userId);
    }

    public String promptContext(Long userId) {
        UserProfileResponse profile = find(userId);
        List<String> parts = new ArrayList<>();
        if (profile.major() != null) parts.add("专业：" + profile.major());
        if (profile.grade() != null) parts.add("年级：" + profile.grade());
        if (!profile.skills().isEmpty()) parts.add("技能：" + String.join("、", profile.skills()));
        if (profile.careerDirection() != null) parts.add("发展方向：" + profile.careerDirection());
        return parts.isEmpty() ? "" : String.join("；", parts);
    }

    private List<String> normalizeSkills(List<String> values) {
        if (values == null) return List.of();
        LinkedHashSet<String> unique = new LinkedHashSet<>();
        for (String value : values) {
            String cleaned = clean(value);
            if (cleaned != null) unique.add(cleaned);
        }
        return List.copyOf(unique);
    }

    private String writeSkills(List<String> skills) {
        try {
            return json.writeValueAsString(skills);
        } catch (JacksonException exception) {
            throw new IllegalStateException("用户画像序列化失败", exception);
        }
    }

    private List<String> readSkills(String value) {
        if (value == null || value.isBlank()) return List.of();
        try {
            return List.copyOf(json.readValue(value, STRING_LIST));
        } catch (JacksonException exception) {
            return List.of();
        }
    }

    private String clean(String value) {
        if (value == null) return null;
        String cleaned = value.trim();
        return cleaned.isEmpty() ? null : cleaned;
    }
}
