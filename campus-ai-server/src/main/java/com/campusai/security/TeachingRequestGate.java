package com.campusai.security;

import com.campusai.exception.UnauthorizedException;

import jakarta.servlet.http.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.HandlerInterceptor;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import java.util.function.LongSupplier;

/** Bounded local admission after JWT validation; not an authorization substitute. */
@Component
public class TeachingRequestGate implements HandlerInterceptor {
    private static final String LEASE=TeachingRequestGate.class.getName()+".lease";
    private static final long MINUTE=TimeUnit.MINUTES.toNanos(1), IDLE=TimeUnit.MINUTES.toNanos(10);
    private final boolean enabled;
    private final Semaphore slots;
    private final int maxUsers,readBurst,writeBurst,readsPerMinute,writesPerMinute;
    private final LongSupplier time;
    private final ConcurrentHashMap<Long,Bucket> users=new ConcurrentHashMap<>();
    private final AtomicLong nextSweep=new AtomicLong();
    @Autowired public TeachingRequestGate(@Value("${app.teaching.requests.enabled:true}") boolean enabled,
            @Value("${app.teaching.requests.max-in-flight:16}") int concurrent,
            @Value("${app.teaching.requests.max-tracked-users:20000}") int maxUsers,
            @Value("${app.teaching.requests.read-burst:30}") int readBurst,
            @Value("${app.teaching.requests.write-burst:10}") int writeBurst,
            @Value("${app.teaching.requests.reads-per-minute:120}") int reads,
            @Value("${app.teaching.requests.writes-per-minute:30}") int writes) {
        this(enabled,concurrent,maxUsers,readBurst,writeBurst,reads,writes,System::nanoTime);
    }
    public TeachingRequestGate(boolean enabled,int concurrent,int maxUsers,int readBurst,int writeBurst,int reads,int writes,LongSupplier time) {
        if(concurrent<1 || concurrent>256 || maxUsers<1 || maxUsers>100000 || readBurst<1 || writeBurst<1 || reads<1 || writes<1)throw new IllegalArgumentException("教学请求上限配置无效");
        this.enabled=enabled;slots=new Semaphore(concurrent);this.maxUsers=maxUsers;this.readBurst=readBurst;this.writeBurst=writeBurst;readsPerMinute=reads;writesPerMinute=writes;this.time=time;
        nextSweep.set(time.getAsLong());
    }
    private final class Bucket {
        double read=readBurst,write=writeBurst;
        long updated,seen;
        Bucket(long now){updated=seen=now;}
        synchronized boolean take(boolean mutation,long now) {
            double elapsed=Math.max(0,now-updated)/(double)MINUTE;
            read=Math.min(readBurst,read+elapsed*readsPerMinute);write=Math.min(writeBurst,write+elapsed*writesPerMinute);updated=seen=now;
            if(mutation){if(write<1)return false;write--;}
            else {if(read<1)return false;read--;}
            return true;
        }
        synchronized boolean expired(long now){return now-seen>=IDLE;}
    }
    private record Lease(Semaphore slots,AtomicBoolean released) {
        void release(){if(released.compareAndSet(false,true))slots.release();}
    }
    private void reject(HttpServletResponse response,int code,String message) {
        response.setHeader("Retry-After", "2");response.setHeader("Cache-Control","no-store");
        throw new ResponseStatusException(HttpStatus.valueOf(code),message);
    }
    @Override public boolean preHandle(HttpServletRequest request,HttpServletResponse response,Object handler) {
        if(!enabled || "OPTIONS".equals(request.getMethod()))return true;
        if(!(request.getAttribute("currentUserId") instanceof Long user) || user<1)throw new UnauthorizedException("需要有效登录会话");
        if(request.getAttribute(LEASE) instanceof Lease old && !old.released.get())return true;
        if(!slots.tryAcquire())reject(response,503,"当前课表请求较多，请稍后重试；未覆盖已有数据");
        boolean accepted=false;
        try {
            long now=time.getAsLong(),due=nextSweep.get();
            if(now-due>=0 && nextSweep.compareAndSet(due,now+MINUTE))users.entrySet().removeIf(e->e.getValue().expired(now));
            Bucket bucket=users.get(user);
            if(bucket==null) {
                // Serialize only first-visitor allocation, keeping the cap exact under contention.
                synchronized(users) {
                    bucket=users.get(user);
                    if(bucket==null) {
                        if(users.size()>=maxUsers)reject(response,503,"课表服务繁忙，请稍后重试");
                        bucket=new Bucket(now);users.put(user,bucket);
                    }
                }
            }
            boolean mutation=!"GET".equals(request.getMethod()) && !"HEAD".equals(request.getMethod());
            if(!bucket.take(mutation,now))reject(response,429,"操作过于频繁，请稍后重试；填写内容不会自动覆盖");
            request.setAttribute(LEASE,new Lease(slots,new AtomicBoolean()));accepted=true;return true;
        } finally {if(!accepted)slots.release();}
    }
    @Override public void afterCompletion(HttpServletRequest request,HttpServletResponse response,Object handler,Exception exception) {
        if(request.getAttribute(LEASE) instanceof Lease lease)lease.release();
    }
    int available(){return slots.availablePermits();}
    int tracked(){return users.size();}
}
