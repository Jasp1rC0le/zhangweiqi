package com.campusai.security;

import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.assertThatCode;

class ProductionSecurityValidatorTest {
    @Test
    void rejectsDevelopmentDatabaseAndHttpOriginInProduction() {
        MockEnvironment environment = new MockEnvironment();
        environment.setActiveProfiles("prod");

        assertThatThrownBy(() -> new ProductionSecurityValidator(environment,
                "root", "", "http://localhost:5173", "http://localhost:5173", false))
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> new ProductionSecurityValidator(environment,
                "campus_app", "test-secret", "http://localhost:5173", "http://localhost:5173", false))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void rejectsUnreviewedPrivacyTextInProduction() {
        MockEnvironment environment = new MockEnvironment();
        environment.setActiveProfiles("prod");
        assertThatThrownBy(() -> new ProductionSecurityValidator(environment, "campus_app",
                "test-secret", "https://campus.example", "https://campus.example", false))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("隐私说明");
    }

    @Test
    void allowsExplicitHttpsOriginAndDedicatedDatabaseUser() {
        MockEnvironment environment = new MockEnvironment();
        environment.setActiveProfiles("prod");
        assertThatCode(() -> new ProductionSecurityValidator(environment, "campus_app",
                "test-secret", "https://campus.example", "https://campus.example", true))
                .doesNotThrowAnyException();
    }
}
