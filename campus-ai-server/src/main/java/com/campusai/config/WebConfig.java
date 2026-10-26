package com.campusai.config;

import com.campusai.security.JwtInterceptor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebConfig implements WebMvcConfigurer {

    private final JwtInterceptor jwtInterceptor;
    private final String[] allowedOrigins;
    private final com.campusai.security.PublicWriteThrottle publicWriteThrottle;
    private final com.campusai.security.TeachingRequestGate teachingGate;

    public WebConfig(JwtInterceptor jwtInterceptor,
            @Value("${app.auth.allowed-origins:http://localhost:5173}") String allowedOrigins,
            Environment environment,
            @Value("${app.auth.secure-cookies:false}") boolean secureCookies,
            com.campusai.security.PublicWriteThrottle publicWriteThrottle,
            com.campusai.security.TeachingRequestGate teachingGate) {
        this.jwtInterceptor = jwtInterceptor;
        this.publicWriteThrottle = publicWriteThrottle;
        this.teachingGate=teachingGate;
        this.allowedOrigins = com.campusai.security.TrustedOrigins.list(allowedOrigins).toArray(String[]::new);
        if (this.allowedOrigins.length == 0
                || java.util.Arrays.asList(this.allowedOrigins).contains("*")) {
            throw new IllegalArgumentException("CORS_ALLOWED_ORIGINS 必须是明确的来源列表");
        }
        if (java.util.Arrays.asList(environment.getActiveProfiles()).contains("prod")) {
            if (!secureCookies || java.util.Arrays.stream(this.allowedOrigins)
                    .anyMatch(origin -> !origin.startsWith("https://")
                            || origin.contains("localhost") || origin.contains("127.0.0.1"))) {
                throw new IllegalArgumentException("生产环境必须启用安全Cookie并配置HTTPS正式来源");
            }
        }
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(publicWriteThrottle).addPathPatterns("/api/users", "/api/contact-messages");
        registry.addInterceptor(jwtInterceptor)
                .addPathPatterns("/api/**")
                .excludePathPatterns(
                        "/api/auth/login",
                        "/api/auth/refresh",
                        "/api/auth/logout",
                        "/api/auth/password-reset/request",
                        "/api/auth/password-reset/confirm",
                        "/api/auth/email/verify",
                        "/api/admin/auth/login",
                        "/api/admin/auth/refresh",
                        "/api/admin/auth/logout",
                        "/api/health",
                        "/api/health/**",
                        "/api/schools",
                        "/api/schools/**"
                );
        // JWT rejection precedes admission; anonymous callers cannot occupy teaching slots.
        registry.addInterceptor(teachingGate).addPathPatterns("/api/teaching/**","/api/timetable/**",
                "/api/admin/teaching/**","/api/account/teaching-identities","/api/admin/teaching-identities","/api/admin/teaching-identities/**",
                "/api/material-actions/**","/api/private-materials","/api/private-materials/**");
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
                .allowedOrigins(allowedOrigins)
                .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
                .allowedHeaders("*")
                .exposedHeaders("X-Content-SHA256")
                .allowCredentials(true)
                .maxAge(3600);
    }
}
