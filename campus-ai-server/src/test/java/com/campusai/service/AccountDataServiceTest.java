package com.campusai.service;

import com.campusai.mapper.UserMapper;
import com.campusai.user.entity.User;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import static org.mockito.Mockito.*;
import static org.assertj.core.api.Assertions.*;

class AccountDataServiceTest {
    @Test void exportIncludesPrivateProjectsAndRatingsButNeverSecretsOrOtherOwners() {
        var jdbc = mock(JdbcTemplate.class); var users = mock(UserMapper.class);
        var user = new User(); user.setId(7L); user.setUsername("person"); user.setRole("STUDENT"); user.setStatus(1);
        user.setPasswordHash("never-export-this");
        when(users.findById(7L)).thenReturn(user);
        var result = new AccountDataService(jdbc, users, mock(PasswordEncoder.class)).export(7L);
        assertThat(result).containsKeys("timetable", "courseSchedule", "projects", "projectVersions", "canteenRatings", "canteenReviews", "campusWallEntries", "campusWallLikes", "campusWallReports");
        assertThat(result.toString()).doesNotContain("never-export-this");
        mockingDetails(jdbc).getInvocations().forEach(call -> {
            Object[] args = call.getArguments();
            assertThat(args[0].toString()).containsPattern("(user_id|owner_id|recipient_id) = \\?").doesNotContain("refresh_hash", "password_hash", "SELECT *");
            assertThat(args[args.length - 1]).isEqualTo(7L);
        });
    }
}
