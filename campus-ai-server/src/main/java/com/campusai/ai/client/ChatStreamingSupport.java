package com.campusai.ai.client;

import com.campusai.dto.ChatResponse;
import com.campusai.security.AuthSessionService;
import jakarta.annotation.PreDestroy;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Consumer;

/** One owner-bound stream with bounded workers/queue/deadline. Heartbeats are not model progress. */
@Component
public class ChatStreamingSupport implements AutoCloseable {
    @FunctionalInterface public interface Operation { ChatResponse run(Consumer<String> delta); }
    private record Event(String type,Object data) {}
    private final ObjectMapper json;
    private final AuthSessionService sessions;
    private final ThreadPoolExecutor workers;
    private final long timeoutMs,heartbeatMs;
    public ChatStreamingSupport(ObjectMapper json,AuthSessionService sessions,
            @Value("${app.ai.streaming.workers:4}") int concurrency,
            @Value("${app.ai.streaming.timeout-ms:150000}") long timeoutMs,
            @Value("${app.ai.streaming.heartbeat-ms:15000}") long heartbeatMs) {
        if(concurrency<1 || concurrency>32 || timeoutMs<20 || timeoutMs>150000 || heartbeatMs<1 || heartbeatMs>=timeoutMs)
            throw new IllegalArgumentException("聊天流并发或截止时间配置无效");
        this.json=json;this.sessions=sessions;this.timeoutMs=timeoutMs;this.heartbeatMs=heartbeatMs;
        workers=new ThreadPoolExecutor(concurrency,concurrency,30,TimeUnit.SECONDS,new SynchronousQueue<>(),r->{
            Thread t=new Thread(r,"campthink-model-stream");t.setDaemon(true);return t;
        },new ThreadPoolExecutor.AbortPolicy());
        workers.allowCoreThreadTimeOut(true);
    }
    public void stream(OutputStream output,long user,String sid,String role,Operation operation) throws IOException {
        var active=new AtomicBoolean(true);var events=new ArrayBlockingQueue<Event>(32);
        long deadline=System.nanoTime()+TimeUnit.MILLISECONDS.toNanos(timeoutMs);Future<?> job=null;
        try {
            if(!sessions.active(sid,user,role)) { write(output,new Event("error",Map.of("status",401,"message","登录已失效，请重新登录")));return; }
            write(output,new Event("status",Map.of("phase","accepted")));
            try {
                job=workers.submit(()->{
                    Consumer<Event> publish=event->{
                        try {
                            while(active.get() && !Thread.currentThread().isInterrupted() && System.nanoTime()<deadline)
                                if(events.offer(event,100,TimeUnit.MILLISECONDS)) return;
                        } catch(InterruptedException ex) {Thread.currentThread().interrupt();}
                        throw new CancellationException("stream ended");
                    };
                    try {
                        int[] characters={0};
                        ChatResponse result=operation.run(delta->{
                            if(delta==null || delta.isEmpty())return;
                            if(delta.length()>200000 || (characters[0]+=delta.length())>200000) throw new IllegalStateException("stream answer too large");
                            publish.accept(new Event("delta",Map.of("content",delta)));
                        });
                        publish.accept(result==null?new Event("error",Map.of("status",404,"message","对话不存在或无权访问")):new Event("done",result));
                    } catch(CancellationException ignored) { /* Client/deadline ended this exact operation. */ }
                    catch(Exception failure) {
                        int status=failure instanceof ResponseStatusException e?e.getStatusCode().value():502;
                        String message=failure instanceof ResponseStatusException e && status<500 && e.getReason()!=null?e.getReason():"AI服务暂时不可用，请稍后重试";
                        try { publish.accept(new Event("error",Map.of("status",status,"message",message))); }
                        catch(CancellationException ignored) { /* No recipient remains. */ }
                    }
                });
            } catch(RejectedExecutionException busy) {
                write(output,new Event("error",Map.of("status",503,"message","回答请求较多，请稍后重试；本次未开始模型调用")));return;
            }
            long nextAuthorization=0,nextHeartbeat=System.nanoTime()+TimeUnit.MILLISECONDS.toNanos(heartbeatMs);
            while(active.get()) {
                long remaining=deadline-System.nanoTime();
                if(remaining<=0) {write(output,new Event("error",Map.of("status",504,"message","本次回答已超时，请核对历史后重试")));return;}
                Event event;
                try {event=events.poll(Math.min(TimeUnit.NANOSECONDS.toMillis(remaining)+1,Math.min(heartbeatMs,1000)),TimeUnit.MILLISECONDS);}
                catch(InterruptedException ex) {Thread.currentThread().interrupt();return;}
                long checkedAt=System.nanoTime();
                boolean terminal=event!=null && !event.type().equals("delta");
                if(checkedAt>=nextAuthorization || terminal) {
                    if(!sessions.active(sid,user,role)) {write(output,new Event("error",Map.of("status",401,"message","登录已失效，请重新登录")));return;}
                    nextAuthorization=checkedAt+TimeUnit.SECONDS.toNanos(1);
                }
                if(event==null) {
                    if(checkedAt>=nextHeartbeat){output.write(": heartbeat\n\n".getBytes(StandardCharsets.UTF_8));output.flush();nextHeartbeat=checkedAt+TimeUnit.MILLISECONDS.toNanos(heartbeatMs);}
                    continue;
                }
                write(output,event);
                nextHeartbeat=System.nanoTime()+TimeUnit.MILLISECONDS.toNanos(heartbeatMs);
                if(event.type().equals("done") || event.type().equals("error")) return;
            }
        } catch(IOException disconnected) {throw disconnected;}
        catch(Exception failure) {write(output,new Event("error",Map.of("status",502,"message","回答服务暂时不可用，请核对历史后重试")));}
        finally {active.set(false);if(job!=null && !job.isDone())job.cancel(true);events.clear();}
    }
    private void write(OutputStream output,Event event) throws IOException {
        output.write(("event: "+event.type()+"\ndata: "+json.writeValueAsString(event.data())+"\n\n").getBytes(StandardCharsets.UTF_8));output.flush();
    }
    @PreDestroy @Override public void close(){workers.shutdownNow();}
}
