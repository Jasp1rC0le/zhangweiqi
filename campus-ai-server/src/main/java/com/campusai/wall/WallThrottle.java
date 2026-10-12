package com.campusai.wall;

import org.springframework.stereotype.Component;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import java.util.HashMap;
import java.util.Map;

/** Bounded single-node burst limiter; no IP or device tracking. */
@Component
public class WallThrottle {
    private record Window(long at,int count) {}
    private final Map<Long,Window> windows=new HashMap<>();
    public synchronized void check(Long user) {
        long now=System.currentTimeMillis();
        windows.entrySet().removeIf(e->now-e.getValue().at()>=60000);
        Window w=windows.get(user);
        if((w!=null&&w.count()>=12)||(w==null&&windows.size()>=10000)) throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,"操作较频繁，请一分钟后再试");
        windows.put(user,w==null?new Window(now,1):new Window(w.at(),w.count()+1));
    }
}
