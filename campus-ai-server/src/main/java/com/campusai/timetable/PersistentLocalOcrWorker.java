package com.campusai.timetable;

import java.io.*;
import java.nio.ByteBuffer;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.List;
import java.util.concurrent.*;
import java.util.concurrent.locks.ReentrantLock;

/** One bounded stdio worker. It reuses model weights, never a request or a parsed result. */
final class PersistentLocalOcrWorker implements AutoCloseable {
    private static final int MAX_FRAME=1024*1024;
    private final List<String> command;
    private final Path directory;
    private final long startupMillis;
    private final ReentrantLock lock=new ReentrantLock();
    private final ExecutorService io=Executors.newSingleThreadExecutor(task->{
        var thread=new Thread(task,"campthink-ocr-pipe");thread.setDaemon(true);return thread;
    });
    private final ScheduledExecutorService watchdog=Executors.newSingleThreadScheduledExecutor(task->{
        var thread=new Thread(task,"campthink-ocr-startup");thread.setDaemon(true);return thread;
    });
    private Process process;
    private Future<?> startup;
    private boolean closed;

    PersistentLocalOcrWorker(List<String> command,Path directory){
        this(command,directory,30000);
    }
    PersistentLocalOcrWorker(List<String> command,Path directory,long startupMillis){
        this.command=List.copyOf(command);this.directory=directory;this.startupMillis=startupMillis;
    }
    void warmup() throws IOException {
        if(!lock.tryLock())return;
        try{start();}finally{lock.unlock();}
    }
    private void start() throws IOException {
        if(closed)throw new IOException("worker closed");
        if(process!=null&&process.isAlive())return;
        stopProcess();
        Process owned=new ProcessBuilder(command).directory(directory.toFile())
                .redirectError(ProcessBuilder.Redirect.DISCARD).start();
        process=owned;
        var ready=new java.util.concurrent.atomic.AtomicBoolean();
        watchdog.schedule(()->{
            if(!ready.get()&&owned.isAlive()){
                owned.descendants().forEach(ProcessHandle::destroyForcibly);owned.destroyForcibly();
            }
        },startupMillis,TimeUnit.MILLISECONDS);
        startup=io.submit(()->{
            if(!"LOCAL_OCR_READY_V1".equals(frame(owned.getInputStream())))throw new IOException("invalid startup");
            ready.set(true);
            return null;
        });
    }
    String request(String message,long deadline) throws IOException,InterruptedException,TimeoutException {
        byte[] input=message.getBytes(StandardCharsets.UTF_8);
        if(input.length>65536||message.indexOf('\n')>=0)throw new IOException("invalid frame");
        lock.lockInterruptibly();
        try{for(int attempt=0;attempt<2;attempt++){
            Future<String> exchange=null;
            try{
                start();await(startup,deadline);Process owned=process;
                exchange=io.submit(()->{
                    var output=owned.getOutputStream();output.write(input);output.write('\n');output.flush();
                    return frame(owned.getInputStream());
                });
                return await(exchange,deadline);
            }catch(IOException failure){
                stopProcess();
                if(attempt==1||System.nanoTime()>=deadline)throw failure;
            }catch(InterruptedException|TimeoutException failure){
                stopProcess();throw failure;
            }finally{if(exchange!=null&&!exchange.isDone())exchange.cancel(true);}
        }}finally{lock.unlock();}
        throw new IOException("worker unavailable");
    }
    private static <T> T await(Future<T> future,long deadline)throws IOException,InterruptedException,TimeoutException{
        long left=Math.min(TimeUnit.SECONDS.toNanos(60),deadline-System.nanoTime());
        if(left<=0)throw new TimeoutException();
        try{return future.get(left,TimeUnit.NANOSECONDS);}
        catch(ExecutionException failure){throw new IOException("worker exchange failed",failure.getCause());}
    }
    private static String frame(InputStream stream)throws IOException{
        var bytes=new ByteArrayOutputStream();
        for(int count=0;count<=MAX_FRAME;count++){
            int next=stream.read();if(next<0)throw new EOFException();
            if(next=='\n')return StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes.toByteArray())).toString();
            if(count==MAX_FRAME)throw new IOException("worker output too large");bytes.write(next);
        }
        throw new IOException("invalid output");
    }
    void invalidate(){lock.lock();try{stopProcess();}finally{lock.unlock();}}
    private void stopProcess(){
        Process owned=process;process=null;
        if(owned!=null){
            if(owned.isAlive()){
                owned.descendants().forEach(ProcessHandle::destroyForcibly);owned.destroyForcibly();
                try{owned.waitFor(3,TimeUnit.SECONDS);}catch(InterruptedException failure){Thread.currentThread().interrupt();}
            }
            try{owned.getInputStream().close();}catch(IOException ignored){}
            try{owned.getOutputStream().close();}catch(IOException ignored){}
        }
        if(startup!=null&&!startup.isDone())startup.cancel(true);startup=null;
    }
    public void close(){lock.lock();try{closed=true;stopProcess();io.shutdownNow();watchdog.shutdownNow();}finally{lock.unlock();}}
}
