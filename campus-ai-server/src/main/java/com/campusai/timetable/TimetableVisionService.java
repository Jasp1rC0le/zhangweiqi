package com.campusai.timetable;

import com.campusai.ai.model.AiModelResult;
import com.campusai.ai.usage.*;
import com.campusai.mapper.UserMapper;
import com.campusai.user.entity.User;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;
import java.time.LocalDate;
import java.util.*;
import java.util.concurrent.*;

/** Explicit consent grants this single uploaded image only. This service cannot read or save schedules. */
// Legacy provider adapter retained for isolated compatibility tests, not registered in the application.
public class TimetableVisionService {
    private final TimetableVisionModel model;private final AiCallAdmission admission;private final AiSpendGuard budget;private final AiUsageRecorder usage;private final UserMapper users;private final ObjectMapper json;
    private final Semaphore slots=new Semaphore(2);private final Set<Long> active=ConcurrentHashMap.newKeySet();
    public TimetableVisionService(TimetableVisionModel model,AiCallAdmission admission,AiSpendGuard budget,AiUsageRecorder usage,UserMapper users,ObjectMapper json){this.model=model;this.admission=admission;this.budget=budget;this.usage=usage;this.users=users;this.json=json;}
    public record Row(String name,Integer weekday,String startTime,String endTime,Integer startPeriod,Integer endPeriod,List<Integer> weeks,String room,String teacher){}
    public record Result(int version,String provider,String model,String semester,String firstMonday,List<Row> rows,List<String> warnings){}
    public TimetableVisionModel.Capability capability(long user){user(user,null);return model.capability();}
    public Result recognize(long owner,byte[] bytes,boolean consent){
        long school=user(owner,null).getSchoolId();
        if(!consent)throw bad("请先确认仅将本次本人课表图片发送给所示Kimi服务识别");
        var config=model.capability();if(!config.available())throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"视觉模型暂未配置，图片未发送");
        if(!slots.tryAcquire())throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,"图片识别正在处理其他请求，请稍后重试");
        if(!active.add(owner)){slots.release();throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,"本账号已有图片识别在处理，请等待后再试");}
        AiCallAdmission.Reservation output=null,input=null;AiSpendGuard.Ticket ticket=null;boolean settled=false,modelStarted=false,modelFinished=false;
        try{
            rejectAnimatedPng(bytes);var image=TimetableService.sanitize(bytes);
            output=admission.reserveTokens(owner,config.maxOutputTokens());
            int inputCount=model.estimate(image.bytes(),image.mime());
            if(inputCount<1||inputCount>config.maxInputTokens())throw bad("图片输入量超出识别范围，请裁剪后重试");
            user(owner,school);input=admission.reserveTokens(owner,inputCount);
            ticket=budget.reserveVision("kimi",config.model(),inputCount,config.maxOutputTokens());
            modelStarted=true;AiModelResult response=model.recognize(image.bytes(),image.mime());modelFinished=true;
            budget.complete(ticket,response);
            admission.settle(owner,input,response.promptTokens()!=null&&response.promptTokens()>=0?response.promptTokens():inputCount);
            admission.settle(owner,output,response.completionTokens()!=null&&response.completionTokens()>=0?response.completionTokens():config.maxOutputTokens());settled=true;
            usage.record(owner,null,response);user(owner,school);
            return parse(response);
        }catch(RuntimeException failure){
            if(!settled){
                if(modelStarted)try{budget.failed(ticket);}catch(RuntimeException accounting){failure.addSuppressed(accounting);}
                // A completed upstream response with failed accounting keeps its reservations occupied.
                if(!modelFinished){
                    if(input!=null)try{admission.release(owner,input);}catch(RuntimeException accounting){failure.addSuppressed(accounting);}
                    if(output!=null)try{admission.release(owner,output);}catch(RuntimeException accounting){failure.addSuppressed(accounting);}
                }
            }throw failure;
        }finally{active.remove(owner);slots.release();}
    }
    private Result parse(AiModelResult response){
        try{
            if(response==null||!"kimi".equals(response.provider())||response.content()==null||response.content().length()>50000)throw invalid();
            Object parsed=json.readValue(response.content(),Object.class);if(!(parsed instanceof Map<?,?> map)||!Set.of("semester","firstMonday","rows").containsAll(map.keySet())||!(map.get("rows") instanceof List<?> rows)||rows.isEmpty()||rows.size()>120)throw invalid();
            String semester=text(map.get("semester"),100),firstMonday=text(map.get("firstMonday"),10);
            if(firstMonday!=null){var date=LocalDate.parse(firstMonday);if(date.getDayOfWeek().getValue()!=1||date.getYear()<2000||date.getYear()>2100)throw invalid();}
            var result=new ArrayList<Row>();var warnings=new ArrayList<String>();int missing=0;
            for(Object raw:rows){
                if(!(raw instanceof Map<?,?> row)||!Set.of("name","weekday","startTime","endTime","startPeriod","endPeriod","weeks","room","teacher").containsAll(row.keySet()))throw invalid();
                String name=text(row.get("name"),100),room=text(row.get("room"),100),teacher=text(row.get("teacher"),100),start=text(row.get("startTime"),5),end=text(row.get("endTime"),5);Integer day=integer(row.get("weekday"),7),sp=integer(row.get("startPeriod"),16),ep=integer(row.get("endPeriod"),16);
                if(start!=null&&!start.matches("(?:[01]\\d|2[0-3]):[0-5]\\d")||end!=null&&!end.matches("(?:[01]\\d|2[0-3]):[0-5]\\d")||start!=null&&end!=null&&start.compareTo(end)>=0||sp!=null&&ep!=null&&sp>ep||(start!=null||end!=null)&&(sp!=null||ep!=null))throw invalid();
                var weeks=new TreeSet<Integer>();Object supplied=row.get("weeks");if(supplied!=null){if(!(supplied instanceof List<?> list)||list.size()>30)throw invalid();for(Object w:list){Integer n=integer(w,30);if(n==null)throw invalid();weeks.add(n);}}
                if(name==null||day==null||weeks.isEmpty()||!((start!=null&&end!=null)||(sp!=null&&ep!=null)))missing++;
                result.add(new Row(name,day,start,end,sp,ep,List.copyOf(weeks),room==null?"":room,teacher==null?"":teacher));
            }
            if(missing>0)warnings.add(missing+"行存在待补充信息，请逐项核对；未自动补猜或丢弃");
            if(firstMonday==null)warnings.add("图片未明确第1周周一日期，请在课程导入区核对填写");
            if(semester==null)warnings.add("图片未明确学期，请核对课程导入区的学期");
            warnings.add("图片识别可能有误，采用前请与原图逐行比对；此步骤没有保存课表");
            return new Result(1,"kimi",response.model(),semester,firstMonday,List.copyOf(result),List.copyOf(warnings));
        }catch(ResponseStatusException e){throw e;}catch(RuntimeException e){throw invalid();}
    }
    private User user(long id,Long school){var u=users.findById(id);if(u==null||!Integer.valueOf(1).equals(u.getStatus())||u.getSchoolId()==null||school!=null&&!school.equals(u.getSchoolId()))throw new ResponseStatusException(HttpStatus.FORBIDDEN,"账号状态或学校范围已变化，请重新登录");return u;}
    private static Integer integer(Object v,int max){if(v==null)return null;if(!(v instanceof Number n)||n.doubleValue()!=n.intValue()||n.intValue()<1||n.intValue()>max)throw invalid();return n.intValue();}
    private static void rejectAnimatedPng(byte[] bytes){
        if(bytes==null||bytes.length<8||bytes[0]!=(byte)137||bytes[1]!=80||bytes[2]!=78||bytes[3]!=71)return;
        for(int offset=8;offset<=bytes.length-12;){
            long size=Integer.toUnsignedLong(java.nio.ByteBuffer.wrap(bytes,offset,4).getInt());
            if(size>bytes.length-offset-12)break;
            if(bytes[offset+4]=='a'&&bytes[offset+5]=='c'&&bytes[offset+6]=='T'&&bytes[offset+7]=='L')throw bad("不支持动态PNG，请截取静态课表画面后再试");
            offset+=(int)size+12;
        }
    }
    private static String text(Object v,int max){if(v==null)return null;if(!(v instanceof String s)||s.length()>max||s.codePoints().anyMatch(c->c<32||c==127))throw invalid();return s.isBlank()?null:s.strip();}
    private static ResponseStatusException invalid(){return new ResponseStatusException(HttpStatus.BAD_GATEWAY,"识别结果不完整或格式不可信，未生成可保存课表；请裁剪清晰图片后手动重试");}
    private static ResponseStatusException bad(String text){return new ResponseStatusException(HttpStatus.BAD_REQUEST,text);}
}
