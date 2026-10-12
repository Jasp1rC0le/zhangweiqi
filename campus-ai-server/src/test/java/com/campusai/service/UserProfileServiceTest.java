package com.campusai.service;

import tools.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class UserProfileServiceTest {
    @SuppressWarnings({"unchecked", "rawtypes"})
    @Test
    void missingProfileDoesNotInventPersonalData() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.query(anyString(), any(RowMapper.class), eq(9L))).thenReturn(List.of());
        UserProfileService service = new UserProfileService(jdbc, new ObjectMapper());

        var profile = service.find(9L);

        assertThat(profile.userId()).isEqualTo(9L);
        assertThat(profile.skills()).isEmpty();
        assertThat(service.promptContext(9L)).isEmpty();
    }
}
