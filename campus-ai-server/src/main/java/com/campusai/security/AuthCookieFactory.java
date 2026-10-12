package com.campusai.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;

import java.time.Duration;

@Component
public class AuthCookieFactory {
    private final boolean secure;
    private final Duration lifetime;

    public AuthCookieFactory(@Value("${app.auth.secure-cookies:false}") boolean secure,
            @Value("${app.auth.refresh-days:30}") long days) {
        this.secure = secure;
        this.lifetime = Duration.ofDays(days);
    }

    public String set(String token, boolean admin) {
        return base(admin).value(token).maxAge(lifetime).build().toString();
    }

    public String clear(boolean admin) {
        return base(admin).value("").maxAge(Duration.ZERO).build().toString();
    }

    private ResponseCookie.ResponseCookieBuilder base(boolean admin) {
        return ResponseCookie.from(admin ? "campus_admin_refresh" : "campus_refresh", "")
                .httpOnly(true).secure(secure).sameSite("Strict")
                .path(admin ? "/api/admin/auth" : "/api/auth");
    }
}
