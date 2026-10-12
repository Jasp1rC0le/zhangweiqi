package com.campusai.security;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

/** Checked before expensive password hashing or insertion of public feedback. */
@Component
public class PublicWriteThrottle implements HandlerInterceptor {
    private final LoginThrottle throttle;
    public PublicWriteThrottle(LoginThrottle throttle) { this.throttle = throttle; }
    @Override public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        if ("POST".equals(request.getMethod())) {
            String path = request.getRequestURI().substring(request.getContextPath().length());
            if ("/api/users".equals(path)) throttle.checkPublic("register", 30, request);
            if ("/api/contact-messages".equals(path)) throttle.checkPublic("contact", 60, request);
        }
        return true;
    }
}
