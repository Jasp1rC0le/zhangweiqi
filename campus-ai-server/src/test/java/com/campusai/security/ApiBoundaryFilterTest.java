package com.campusai.security;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import java.util.concurrent.atomic.AtomicBoolean;
import static org.assertj.core.api.Assertions.*;

class ApiBoundaryFilterTest {
    private final ApiBoundaryFilter filter = new ApiBoundaryFilter("https://campus.example,http://localhost:5173");
    private MockHttpServletResponse run(String method, String path, String origin, String referer, String site) throws Exception {
        var request = new MockHttpServletRequest(method, path);
        if (origin != null) request.addHeader("Origin", origin);
        if (referer != null) request.addHeader("Referer", referer);
        if (site != null) request.addHeader("Sec-Fetch-Site", site);
        var response = new MockHttpServletResponse();
        filter.doFilter(request, response, (req, res) -> response.setStatus(204));
        return response;
    }
    @Test void authRequiresExactSourceNotSiblingOrPrefixOrNull() throws Exception {
        for (String path : new String[]{"/api/auth/login", "/api/auth/refresh", "/api/auth/logout", "/api/admin/auth/refresh"}) {
            for (String source : new String[]{null, "null", "https://evil.example", "https://campus.example.evil.test", "https://sub.campus.example"}) {
                assertThat(run("POST", path, source, null, "same-site").getStatus()).isEqualTo(403);
            }
            assertThat(run("POST", path, "https://campus.example", null, "same-origin").getStatus()).isEqualTo(204);
        }
    }
    @Test void allowedCrossOriginDevAndRefererFallbackButNeverBadOriginFallback() throws Exception {
        assertThat(run("POST", "/api/auth/refresh", "http://localhost:5173", null, "cross-site").getStatus()).isEqualTo(204);
        assertThat(run("POST", "/api/auth/refresh", null, "https://campus.example/chat", null).getStatus()).isEqualTo(204);
        assertThat(run("POST", "/api/auth/refresh", "null", "https://campus.example/chat", null).getStatus()).isEqualTo(403);
        assertThat(run("POST", "/api/auth/refresh", null, "https://campus.example@evil.test/chat", null).getStatus()).isEqualTo(403);
    }
    @Test void unsafeApiRequestsRejectBrowserCrossSiteButPermitNonBrowserBearerFlow() throws Exception {
        assertThat(run("DELETE", "/api/account", "https://evil.test", null, null).getStatus()).isEqualTo(403);
        assertThat(run("POST", "/api/contact-messages", null, null, "cross-site").getStatus()).isEqualTo(403);
        assertThat(run("PUT", "/api/projects/id", null, null, null).getStatus()).isEqualTo(204);
        assertThat(run("OPTIONS", "/api/auth/login", "https://evil.test", null, null).getStatus()).isEqualTo(204);
    }
    @Test void publicAndErrorResponsesAreNotCacheableAndDoNotExposeSources() throws Exception {
        var denied = run("POST", "/api/auth/login", "https://private.example", null, null);
        assertThat(denied.getHeader("Cache-Control")).isEqualTo("no-store");
        assertThat(denied.getHeader("X-Content-Type-Options")).isEqualTo("nosniff");
        assertThat(denied.getContentAsString()).doesNotContain("private.example");
        assertThat(run("GET", "/api/health", null, null, null).getHeader("X-Frame-Options")).isEqualTo("DENY");
        var req = new MockHttpServletRequest("GET", "/api/account");
        var res = new MockHttpServletResponse();
        assertThatThrownBy(() -> filter.doFilter(req, res, (r,s) -> { throw new jakarta.servlet.ServletException("failure"); })).isInstanceOf(jakarta.servlet.ServletException.class);
        assertThat(res.getHeader("Cache-Control")).isEqualTo("no-store");
    }
    @Test void nonApiResponsesAreNotGivenApiCsp() throws Exception {
        var request = new MockHttpServletRequest("GET", "/chat");
        var response = new MockHttpServletResponse();
        AtomicBoolean called = new AtomicBoolean();
        filter.doFilter(request, response, (r,s) -> called.set(true));
        assertThat(called).isTrue();
        assertThat(response.getHeader("Content-Security-Policy")).isNull();
    }
    @Test void rejectsMalformedConfiguredOrigins() {
        for (String origin : new String[]{"*", "null", "https://", "https://user@campus.example", "https://campus.example/path", "https://campus.example?x=1", "https://campus.example#x", "https://campus.example,", "https://*.example"}) {
            assertThatThrownBy(() -> new ApiBoundaryFilter(origin)).isInstanceOf(IllegalArgumentException.class);
        }
    }
}
