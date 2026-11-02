package com.campusai.timetable;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.api.condition.EnabledOnOs;
import org.junit.jupiter.api.condition.OS;
import tools.jackson.databind.ObjectMapper;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;

@EnabledOnOs({OS.LINUX,OS.MAC})
@Timeout(15)
class PersistentLocalOcrWorkerTest {
    @TempDir Path directory;
    final ObjectMapper json=new ObjectMapper();
    PersistentLocalOcrWorker worker(String body)throws Exception{
        Path script=directory.resolve("fake-python");
        Files.writeString(script,"#!/usr/bin/env python3\nimport json,sys,os,time\nwith open("+json.writeValueAsString(directory.resolve("starts").toString())+",'a') as f:f.write(str(os.getpid())+'\\n')\nprint('LOCAL_OCR_READY_V1',flush=True)\nfor line in sys.stdin:\n request=json.loads(line)\n"+body+"\n");
        assertTrue(script.toFile().setExecutable(true));
        return new PersistentLocalOcrWorker(List.of(script.toString()),directory);
    }
    long deadline(){return System.nanoTime()+TimeUnit.SECONDS.toNanos(5);}
    List<Long> pids()throws Exception{return Files.readAllLines(directory.resolve("starts")).stream().map(Long::valueOf).toList();}
    void stopped()throws Exception{for(long pid:pids())assertFalse(ProcessHandle.of(pid).map(ProcessHandle::isAlive).orElse(false));}
    @Test void modelProcessIsReusedAndUnicodeFramesRemainSeparate()throws Exception{
        try(var worker=worker(" print(json.dumps(request,ensure_ascii=False),flush=True)")){
            worker.warmup();
            for(String value:List.of("合成课程Ⅲ","另一请求")){
                String input=json.writeValueAsString(Map.of("id",UUID.randomUUID().toString(),"text",value));
                assertEquals(json.readValue(input,Map.class),json.readValue(worker.request(input,deadline()),Map.class));
            }
            assertEquals(1,pids().size());
        }stopped();
    }
    @Test void idleExitRestartsOneWorkerWithoutReturningAnOldResponse()throws Exception{
        try(var worker=worker(" print(json.dumps(request),flush=True)\n if request.get('exit'):sys.exit(0)")){
            assertEquals("{\"exit\": true}",worker.request("{\"exit\":true}",deadline()));
            String next=worker.request("{\"next\":true}",deadline());assertEquals(Boolean.TRUE,json.readValue(next,Map.class).get("next"));
            assertEquals(2,pids().size());
        }stopped();
    }
    @Test void timeoutKillsOnlyItsWorkerAndAFollowingRequestCanSucceed()throws Exception{
        try(var worker=worker(" if request.get('slow'):time.sleep(4)\n print(json.dumps(request),flush=True)")){
            worker.request("{}",deadline());
            assertThrows(TimeoutException.class,()->worker.request("{\"slow\":true}",System.nanoTime()+TimeUnit.MILLISECONDS.toNanos(120)));
            stopped();assertEquals("{}",worker.request("{}",deadline()));
        }stopped();
    }
    @Test void oversizedOrInvalidUnicodeFramesAreNeverReturned()throws Exception{
        for(String body:List.of(" print('x'*(1024*1024+1),flush=True)"," sys.stdout.buffer.write(b'\\xff\\n');sys.stdout.buffer.flush()")){
            try(var worker=worker(body)){assertThrows(java.io.IOException.class,()->worker.request("{}",deadline()));}
            stopped();
        }
    }
    @Test void aPrewarmThatNeverBecomesReadyCannotLeaveAnUnboundedProcess()throws Exception{
        Path script=directory.resolve("never-ready");
        Files.writeString(script,"#!/usr/bin/env python3\nimport os,time\nwith open("+json.writeValueAsString(directory.resolve("starts").toString())+",'a') as f:f.write(str(os.getpid())+'\\n')\ntime.sleep(10)\n");
        assertTrue(script.toFile().setExecutable(true));
        try(var worker=new PersistentLocalOcrWorker(List.of(script.toString()),directory,150)){
            worker.warmup();var field=PersistentLocalOcrWorker.class.getDeclaredField("process");field.setAccessible(true);
            var owned=(Process)field.get(worker);assertNotNull(owned);long end=System.nanoTime()+TimeUnit.SECONDS.toNanos(3);
            while(owned.isAlive()&&System.nanoTime()<end)Thread.sleep(10);
            assertFalse(owned.isAlive());
        }
    }
}
