package com.campusai.canteen;

import org.springframework.stereotype.Component;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import java.time.Clock;
import java.util.HashMap;
import java.util.Map;

/** Single-instance burst control. Stores account IDs for one minute, no IP or device fingerprint. */
@Component
public class CanteenWriteThrottle {
    private record Window(long start, int count) {}
    private final Map<Long, Window> windows = new HashMap<>();
    private final Clock clock;
    public CanteenWriteThrottle() { this(Clock.systemUTC()); }
    CanteenWriteThrottle(Clock clock) { this.clock = clock; }
    public synchronized void check(Long userId) {
        long now = clock.millis();
        windows.entrySet().removeIf(entry -> now - entry.getValue().start() >= 60_000);
        Window window = windows.get(userId);
        if ((window != null && window.count() >= 30) || (window == null && windows.size() >= 10_000)) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "操作太频繁，请一分钟后再试");
        }
        windows.put(userId, window == null ? new Window(now, 1) : new Window(window.start(), window.count() + 1));
    }
}
