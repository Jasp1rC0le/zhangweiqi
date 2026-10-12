package com.campusai.security;

import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;
import static org.assertj.core.api.Assertions.*;

class ProductionPolicyValidatorTest {
    private MockEnvironment ready() {
        var env = new MockEnvironment(); env.setActiveProfiles("prod");
        return env.withProperty("PRIVACY_OPERATOR_NAME", "隔离测试经营主体")
                .withProperty("PRIVACY_CONTACT_EMAIL", "test@example.org")
                .withProperty("PRIVACY_POLICY_VERSION", PrivacyPolicyVersion.CURRENT)
                .withProperty("PRIVACY_PROCESSORS_CONFIRMED", "true")
                .withProperty("PRIVACY_RETENTION_CONFIRMED", "true");
    }
    @Test void leavesLocalDevelopmentAvailable() {
        assertThatCode(() -> new ProductionPolicyValidator(new MockEnvironment())).doesNotThrowAnyException();
    }
    @Test void rejectsMissingOperatorOrUnconfirmedProcessors() {
        assertThatThrownBy(() -> new ProductionPolicyValidator(ready().withProperty("PRIVACY_OPERATOR_NAME", ""))).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> new ProductionPolicyValidator(ready().withProperty("PRIVACY_PROCESSORS_CONFIRMED", "false"))).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> new ProductionPolicyValidator(ready().withProperty("PRIVACY_POLICY_VERSION", "2026-09-21"))).isInstanceOf(IllegalStateException.class);
    }
    @Test void rejectsUnverifiedOrCleartextMail() {
        var env = ready().withProperty("spring.mail.host", "smtp.example.org")
                .withProperty("spring.mail.properties.mail.smtp.ssl.enable", "true")
                .withProperty("spring.mail.properties.mail.smtp.ssl.checkserveridentity", "true");
        assertThatCode(() -> new ProductionPolicyValidator(env)).doesNotThrowAnyException();
        assertThatThrownBy(() -> new ProductionPolicyValidator(env.withProperty("spring.mail.properties.mail.smtp.ssl.checkserveridentity", "false"))).isInstanceOf(IllegalStateException.class);
        env.withProperty("spring.mail.properties.mail.smtp.ssl.checkserveridentity", "true").withProperty("spring.mail.properties.mail.smtp.ssl.enable", "false");
        assertThatThrownBy(() -> new ProductionPolicyValidator(env)).isInstanceOf(IllegalStateException.class);
    }
    @Test void readsBracketedYamlMailPropertiesWithoutUnsafeDefaults() {
        var env = ready().withProperty("spring.mail.host", "smtp.example.org")
                .withProperty("spring.mail.properties[mail.smtp.ssl.enable]", "true")
                .withProperty("spring.mail.properties[mail.smtp.ssl.checkserveridentity]", "false");
        assertThatThrownBy(() -> new ProductionPolicyValidator(env)).isInstanceOf(IllegalStateException.class);
        env.withProperty("spring.mail.properties[mail.smtp.ssl.checkserveridentity]", "true");
        assertThatCode(() -> new ProductionPolicyValidator(env)).doesNotThrowAnyException();
        env.withProperty("spring.mail.properties[mail.smtp.ssl.trust]", "*");
        assertThatThrownBy(() -> new ProductionPolicyValidator(env)).isInstanceOf(IllegalStateException.class);
    }
}
