package com.campusai.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import java.io.IOException;
import java.util.Set;

/** Covers public authentication and errors, not just successful authenticated requests. */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 10)
public class ApiBoundaryFilter extends OncePerRequestFilter {
    private final Set<String> origins;
    public ApiBoundaryFilter(@Value("${app.auth.allowed-origins:http://localhost:5173}") String origins) {
        this.origins = TrustedOrigins.list(origins);
    }
    @Override protected boolean shouldNotFilter(HttpServletRequest request) {
        return !request.getRequestURI().startsWith(request.getContextPath() + "/api/");
    }
    @Override protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("Pragma", "no-cache");
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.setHeader("X-Frame-Options", "DENY");
        response.setHeader("Referrer-Policy", "no-referrer");
        response.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
        if (!Set.of("GET", "HEAD", "OPTIONS").contains(request.getMethod()) && !trusted(request)) {
            response.setStatus(403);
            response.setContentType("application/json;charset=UTF-8");
            response.getWriter().write("{\"status\":403,\"message\":\"请求来源未获允许，请从网站页面重试\"}");
            return;
        }
        chain.doFilter(request, response);
    }
    private boolean trusted(HttpServletRequest request) {
        String origin = request.getHeader("Origin");
        if (origin != null) return origins.contains(origin);
        String referer = request.getHeader("Referer");
        if (referer != null) {
            try { return origins.contains(TrustedOrigins.fromReferer(referer)); }
            catch (IllegalArgumentException exception) { return false; }
        }
        String site = request.getHeader("Sec-Fetch-Site");
        if (site != null && !"same-origin".equals(site)) return false;
        String path = request.getRequestURI().substring(request.getContextPath().length());
        // Cookie-backed auth must prove origin, including same-site sibling hosts.
        if (path.startsWith("/api/auth/") || path.startsWith("/api/admin/auth/")) return false;
        // Non-browser bearer clients remain supported; identity is validated downstream.
        return true;
    }
}
