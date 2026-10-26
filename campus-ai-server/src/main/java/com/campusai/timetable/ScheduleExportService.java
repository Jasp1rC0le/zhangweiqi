package com.campusai.timetable;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import tools.jackson.databind.ObjectMapper;
import java.time.*;
import java.util.*;
import java.util.concurrent.Semaphore;
import java.io.IOException;

/** Prepared file memory is bounded and expires; every download rereads authorization and current source. */
@Service
public class ScheduleExportService {
    private final ScheduleExportSource source;private final ScheduleFileWriter writer;private final ObjectMapper json;private final Clock clock;
    private final Semaphore encoders=new Semaphore(2);private final LinkedHashMap<String,Prepared> files=new LinkedHashMap<>();
    private record Prepared(long owner,ScheduleExportSource.Filter filter,String sourceHash,byte[] bytes,String sha,String mime,String filename,Instant expires){}
    public record Preview(String token,ScheduleExportSource.Filter filter,String scope,int count,String sha256,int bytes,String mime,String filename,Instant expiresAt,List<ScheduleExportSource.Row> sample,List<String> warnings){}
    public record Download(String token){}
    public record Artifact(byte[] bytes,String sha256,String mime,String filename){}
    @Autowired public ScheduleExportService(ScheduleExportSource source,ScheduleFileWriter writer,ObjectMapper json){this(source,writer,json,Clock.systemUTC());}
    public ScheduleExportService(ScheduleExportSource source,ScheduleFileWriter writer,ObjectMapper json,Clock clock){this.source=source;this.writer=writer;this.json=json;this.clock=clock;}
    public Preview prepare(long user,ScheduleExportSource.Filter filter)throws IOException{
        if(!encoders.tryAcquire())throw ScheduleExportSource.error(503,"正在生成其他课表文件，请稍后重试；未重复排队");
        try{var snapshot=source.read(user,filter);if(snapshot.entries().isEmpty())throw ScheduleExportSource.error(400,"当前来源与筛选范围没有可导出的课程，请检查日期、时段或班级");String hash=ScheduleFileWriter.hash(json.writeValueAsBytes(snapshot));var file=writer.write(snapshot,clock.instant());if(file.bytes().length>4*1024*1024)throw ScheduleExportSource.error(400,"文件超过4MB，请缩小范围；未截断导出");String sha=ScheduleFileWriter.hash(file.bytes()),token=UUID.randomUUID().toString(),name="课程安排-"+snapshot.filter().from()+"-"+snapshot.filter().to()+"."+file.extension();Instant expires=clock.instant().plusSeconds(300);
            synchronized(files){files.entrySet().removeIf(e->!e.getValue().expires.isAfter(clock.instant()));while(files.values().stream().filter(p->p.owner==user).count()>=2){String oldest=files.entrySet().stream().filter(e->e.getValue().owner==user).findFirst().orElseThrow().getKey();files.remove(oldest);}int used=files.values().stream().mapToInt(p->p.bytes.length).sum();if(files.size()>=24||used+file.bytes().length>16*1024*1024)throw ScheduleExportSource.error(429,"课表文件准备较多，请稍后重试");files.put(token,new Prepared(user,snapshot.filter(),hash,file.bytes(),sha,file.mime(),name,expires));}
            return new Preview(token,snapshot.filter(),snapshot.scopeLabel(),snapshot.entries().size(),sha,file.bytes().length,file.mime(),name,expires,snapshot.entries().subList(0,Math.min(3,snapshot.entries().size())),snapshot.warnings());
        }finally{encoders.release();}
    }
    public Artifact download(long user,Download input){
        if(input==null||input.token==null||!input.token.matches("[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}"))throw ScheduleExportSource.error(400,"先准备并核对课表文件");Prepared p;synchronized(files){p=files.get(input.token);}
        if(p==null||p.owner!=user||!p.expires.isAfter(clock.instant()))throw ScheduleExportSource.error(410,"课表文件准备已失效，请重新核对");var snapshot=source.read(user,p.filter);String hash=ScheduleFileWriter.hash(json.writeValueAsBytes(snapshot));if(!hash.equals(p.sourceHash))throw ScheduleExportSource.error(409,"课表或授权范围发生变化，请重新准备，没有下载旧文件");if(!p.expires.isAfter(clock.instant()))throw ScheduleExportSource.error(410,"读取期间准备已到期，请重新核对");return new Artifact(p.bytes.clone(),p.sha,p.mime,p.filename);
    }
}
