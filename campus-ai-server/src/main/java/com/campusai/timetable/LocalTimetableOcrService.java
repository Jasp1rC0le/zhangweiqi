package com.campusai.timetable;

import com.campusai.mapper.UserMapper;
import com.campusai.user.entity.User;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import javax.imageio.ImageIO;
import java.io.ByteArrayInputStream;
import java.util.*;
import java.util.concurrent.*;

@Service
public class LocalTimetableOcrService {
    private final LocalOcrEngine engine;private final UserMapper users;private final SchoolTimetableImageParser parser=new SchoolTimetableImageParser();
    private final Semaphore slots=new Semaphore(1);private final Set<Long> active=ConcurrentHashMap.newKeySet();
    public LocalTimetableOcrService(LocalOcrEngine engine,UserMapper users){this.engine=engine;this.users=users;}
    public record Capability(int version,boolean available,String provider,String engine,boolean external,int maxBytes,int maxRows){}
    public record Result(int version,String provider,String engine,boolean external,String semester,String firstMonday,Integer week,String weekMonday,List<SchoolTimetableImageParser.Row> rows,List<String> warnings){}
    public Capability capability(long owner){user(owner,null);return new Capability(2,engine.available(),"local-ocr",engine.engine(),false,TimetableService.MAX_IMAGE_BYTES,120);}
    public Result recognize(long owner,byte[] bytes){
        long school=user(owner,null).getSchoolId();if(!engine.available())throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"后台本地识别尚未就绪，可先导入表格文件");
        if(!active.add(owner))throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,"本账号已有截图正在识别，请稍候");
        boolean acquired=slots.tryAcquire();if(!acquired){active.remove(owner);throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,"后台正在识别其他截图，请稍后重试");}
        try{
            rejectAnimation(bytes);TimetableService.sanitize(bytes);
            // Validation has decoded and bounded the original. OCR writes fresh PNG pixels,
            // avoiding an extra lossy JPEG round trip while discarding uploaded metadata.
            var image=ImageIO.read(new ByteArrayInputStream(bytes));
            long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(75);
            var full=engine.read(image,deadline);var header=parser.header(image,full);var strip=parser.periodStrip(image,header);
            var labels=engine.regions(image,List.of(strip),deadline);var grid=parser.grid(image,header,full,labels.get(0).lines(),strip);
            var cards=parser.cards(image,header,grid);var text=engine.regions(image,cards.stream().map(SchoolTimetableImageParser.Card::region).toList(),deadline);
            var result=parser.finish(header,cards,text);user(owner,school);
            return new Result(2,"local-ocr",engine.engine(),false,result.semester(),result.firstMonday(),result.week(),result.weekMonday(),result.rows(),result.warnings());
        }catch(ResponseStatusException e){throw e;}catch(Exception e){throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,"本地识别未完成，请裁剪清晰课表后再试；没有保存或外发图片");}
        finally{active.remove(owner);slots.release();}
    }
    private User user(long id,Long school){var u=users.findById(id);if(u==null||!Integer.valueOf(1).equals(u.getStatus())||u.getSchoolId()==null||school!=null&&!school.equals(u.getSchoolId()))throw new ResponseStatusException(HttpStatus.FORBIDDEN,"账号或学校范围已变化，请重新登录");return u;}
    private void rejectAnimation(byte[] b){if(b==null||b.length<8||b[0]!=(byte)137||b[1]!=80||b[2]!=78||b[3]!=71)return;for(int off=8;off<=b.length-12;){long n=Integer.toUnsignedLong(java.nio.ByteBuffer.wrap(b,off,4).getInt());if(n>b.length-off-12)break;if(b[off+4]=='a'&&b[off+5]=='c'&&b[off+6]=='T'&&b[off+7]=='L')throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"请使用静态PNG或JPG截图");off+=(int)n+12;}}
}
