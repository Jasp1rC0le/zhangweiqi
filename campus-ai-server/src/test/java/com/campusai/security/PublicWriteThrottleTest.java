package com.campusai.security;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class PublicWriteThrottleTest {
    @Test void publicWritesAreThrottledButReadsAreNot() {
        var throttle = mock(LoginThrottle.class);
        var interceptor = new PublicWriteThrottle(throttle);
        var signup = new MockHttpServletRequest("POST", "/api/users");
        var feedback = new MockHttpServletRequest("POST", "/api/contact-messages");
        interceptor.preHandle(signup, new MockHttpServletResponse(), new Object());
        interceptor.preHandle(feedback, new MockHttpServletResponse(), new Object());
        interceptor.preHandle(new MockHttpServletRequest("GET", "/api/users"), new MockHttpServletResponse(), new Object());
        verify(throttle).checkPublic("register",30,signup);
        verify(throttle).checkPublic("contact",60,feedback);
        verifyNoMoreInteractions(throttle);
    }
    @Test void usesDigestAndPeerAddressNotClientForwardingHeaderAndFailsClosed() {
        var jdbc = mock(JdbcTemplate.class);
        var request = new MockHttpServletRequest();
        request.setRemoteAddr("192.0.2.1");
        request.addHeader("X-Forwarded-For", "198.51.100.9");
        when(jdbc.queryForObject(anyString(), eq(Integer.class), any(Object.class))).thenReturn(31);
        assertThatThrownBy(() -> new LoginThrottle(jdbc).checkPublic("register",30,request)).hasMessageContaining("429");
        verify(jdbc).update(anyString(), argThat((Object value) -> value.toString().matches("[a-f0-9]{64}")));
    }
}
