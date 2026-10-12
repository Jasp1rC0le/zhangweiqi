package com.campusai.security;

import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;
import java.util.Arrays;

/** No identity is invented and no secrets are included in a validation error. */
@Component
public class ProductionPolicyValidator {
    public ProductionPolicyValidator(Environment env) {
        if (!Arrays.asList(env.getActiveProfiles()).contains("prod")) return;
        String operator = env.getProperty("PRIVACY_OPERATOR_NAME", "").trim();
        String email = env.getProperty("PRIVACY_CONTACT_EMAIL", "");
        if (operator.length() < 2 || operator.matches(".*(待填写|待确认|示例|example).*")) {
            throw new IllegalStateException("PRIVACY_OPERATOR_NAME 须填写新执照的真实运营主体，不得沿用旧公司");
        }
        if (!email.matches("[^\\s@]+@[^\\s@]+\\.[^\\s@]+")
                || !PrivacyPolicyVersion.CURRENT.equals(env.getProperty("PRIVACY_POLICY_VERSION"))) {
            throw new IllegalStateException("请核对 PRIVACY_CONTACT_EMAIL 与本次发布的 PRIVACY_POLICY_VERSION");
        }
        if (!Boolean.parseBoolean(env.getProperty("PRIVACY_PROCESSORS_CONFIRMED", "false"))
                || !Boolean.parseBoolean(env.getProperty("PRIVACY_RETENTION_CONFIRMED", "false"))) {
            throw new IllegalStateException("实际第三方处理清单及日志、备份期限尚未确认");
        }
        if (!env.getProperty("spring.mail.host", "").isBlank()) {
            var properties = org.springframework.boot.context.properties.bind.Binder.get(env)
                    .bind("spring.mail.properties", org.springframework.boot.context.properties.bind.Bindable.mapOf(String.class, String.class))
                    .orElse(java.util.Map.of());
            boolean ssl = Boolean.parseBoolean(properties.getOrDefault("mail.smtp.ssl.enable", "false"));
            boolean identity = Boolean.parseBoolean(properties.getOrDefault("mail.smtp.ssl.checkserveridentity", "false"));
            boolean startTls = Boolean.parseBoolean(properties.getOrDefault("mail.smtp.starttls.required", "false"))
                    && Boolean.parseBoolean(properties.getOrDefault("mail.smtp.starttls.enable", "false"));
            if ((!ssl && !startTls) || !identity || !properties.getOrDefault("mail.smtp.ssl.trust", "").isBlank()) {
                throw new IllegalStateException("生产 SMTP 必须启用 TLS 和服务器身份校验，禁止 ssl.trust 绕过证书验证");
            }
        }
    }
}
