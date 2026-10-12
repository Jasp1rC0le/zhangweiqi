package com.campusai.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import java.util.Arrays;

/** Refuse a production start with development defaults or missing secrets. */
@Component
public class ProductionSecurityValidator {
    public ProductionSecurityValidator(Environment environment,
            @Value("${spring.datasource.username}") String dbUsername,
            @Value("${spring.datasource.password:}") String dbPassword,
            @Value("${app.auth.public-web-url:http://localhost:5173}") String publicWebUrl,
            @Value("${app.auth.allowed-origins:http://localhost:5173}") String allowedOrigins,
            @Value("${app.privacy.approved:false}") boolean privacyApproved) {
        if (!Arrays.asList(environment.getActiveProfiles()).contains("prod")) return;
        if (dbPassword.isBlank() || "root".equalsIgnoreCase(dbUsername.trim())) {
            throw new IllegalStateException("生产环境必须使用专用数据库账号和非空数据库密码");
        }
        var origins = TrustedOrigins.list(allowedOrigins);
        TrustedOrigins.parse(publicWebUrl);
        if (!publicWebUrl.startsWith("https://")
                || origins.stream().anyMatch(origin -> !origin.startsWith("https://"))
                || !origins.contains(publicWebUrl)) {
            throw new IllegalStateException("生产环境 PUBLIC_WEB_URL 必须是允许的 HTTPS 来源");
        }
        if (!privacyApproved) {
            throw new IllegalStateException("生产隐私说明尚未确认：需审核真实主体、数据处理及第三方清单");
        }
    }
}
