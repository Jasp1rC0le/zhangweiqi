package com.campusai.ai.client;

import com.campusai.dto.ChatResponse;
import com.campusai.security.AuthSessionService;
import org.junit.jupiter.api.*;
import tools.jackson.databind.ObjectMapper;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@Timeout(5)
class ChatStreamingSupportTest {
    final AuthSessionService sessions=mock(AuthSessionService.class);
    @BeforeEach void setup(){when(sessions.active("sid",1L,"STUDENT")).thenReturn(true);}
    ChatStreamingSupport support(long timeout){return new ChatStreamingSupport(new ObjectMapper(),sessions,1,timeout,10);}
    ChatResponse response(){return new ChatResponse(null,null,List.of(),List.of());}
    @Test void normalStreamHasRealAcceptanceDeltasAndExactlyOneTerminalEvent() throws Exception {
        try(var stream=support(1000)) {
            var out=new ByteArrayOutputStream();stream.stream(out,1,"sid","STUDENT",delta->{delta.accept("合成回答");return response();});
            String body=out.toString(StandardCharsets.UTF_8);assertTrue(body.startsWith("event: status"));assertTrue(body.contains("event: delta"));
            assertEquals(1,body.split("event: done",-1).length-1);assertFalse(body.contains("event: error"));
        }
    }
    @Test void blockedModelGetsHeartbeatDeadlineAndOwnedTaskCancellation() throws Exception {
        try(var stream=support(80)) {
            var interrupted=new CountDownLatch(1);var out=new ByteArrayOutputStream();
            stream.stream(out,1,"sid","STUDENT",delta->{try{new CountDownLatch(1).await();}catch(InterruptedException ex){interrupted.countDown();Thread.currentThread().interrupt();}return response();});
            assertTrue(interrupted.await(1,TimeUnit.SECONDS));String body=out.toString(StandardCharsets.UTF_8);
            assertTrue(body.contains(": heartbeat"));assertTrue(body.contains("504"));assertFalse(body.contains("event: done"));
        }
    }
    @Test void revokedSessionStopsBeforeAnyFurtherContent() throws Exception {
        try(var stream=support(1000)) {
            var out=new ByteArrayOutputStream();
            stream.stream(out,1,"sid","STUDENT",delta->{when(sessions.active("sid",1L,"STUDENT")).thenReturn(false);delta.accept("不应显示的后续内容");return response();});
            String body=out.toString(StandardCharsets.UTF_8);assertTrue(body.contains("401"));assertFalse(body.contains("不应显示"));assertFalse(body.contains("event: done"));
        }
    }
    @Test void disconnectCancelsThisWorkerWithoutStartingAnyReplacement() throws Exception {
        try(var stream=support(1000)) {
            var stopped=new CountDownLatch(1);var started=new CountDownLatch(1);
            OutputStream disconnected=new OutputStream(){int calls;public void write(int b)throws IOException{if(++calls>50)throw new IOException("closed");}};
            assertThrows(IOException.class,()->stream.stream(disconnected,1,"sid","STUDENT",delta->{started.countDown();try{new CountDownLatch(1).await();}catch(InterruptedException ex){stopped.countDown();Thread.currentThread().interrupt();}return response();}));
            if(started.getCount()==0) assertTrue(stopped.await(1,TimeUnit.SECONDS));
        }
    }
    @Test void saturatedWorkerRejectsInsteadOfQueuingAnotherPaidOperation() throws Exception {
        var caller=Executors.newSingleThreadExecutor();
        try(var stream=support(1000)) {
            var began=new CountDownLatch(1);var release=new CountDownLatch(1);var called=new AtomicBoolean();
            Future<?> first=caller.submit(()->{try{stream.stream(new ByteArrayOutputStream(),1,"sid","STUDENT",delta->{began.countDown();try{release.await();}catch(InterruptedException e){Thread.currentThread().interrupt();}return response();});}catch(IOException e){throw new UncheckedIOException(e);}});
            assertTrue(began.await(1,TimeUnit.SECONDS));var second=new ByteArrayOutputStream();
            stream.stream(second,1,"sid","STUDENT",delta->{called.set(true);return response();});
            assertFalse(called.get());assertTrue(second.toString(StandardCharsets.UTF_8).contains("503"));release.countDown();first.get(1,TimeUnit.SECONDS);
        } finally {caller.shutdownNow();}
    }
    @Test void sessionStorageFailureIsStillSseErrorNotJsonAppendedToStream() throws Exception {
        try(var stream=support(1000)) {
            when(sessions.active("sid",1L,"STUDENT")).thenThrow(new IllegalStateException("SECRET_DATABASE"));
            var out=new ByteArrayOutputStream();stream.stream(out,1,"sid","STUDENT",delta->response());
            assertTrue(out.toString(StandardCharsets.UTF_8).contains("event: error"));assertFalse(out.toString(StandardCharsets.UTF_8).contains("SECRET_DATABASE"));
        }
    }
}
