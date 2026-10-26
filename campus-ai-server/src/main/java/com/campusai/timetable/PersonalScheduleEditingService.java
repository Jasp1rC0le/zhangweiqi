package com.campusai.timetable;

import org.springframework.stereotype.Service;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import tools.jackson.databind.ObjectMapper;
import java.time.LocalDate;
import java.util.*;

@Service
public class PersonalScheduleEditingService {
    private final CourseScheduleService schedules;private final JdbcTemplate jdbc;private final ObjectMapper json;
    public PersonalScheduleEditingService(CourseScheduleService schedules,JdbcTemplate jdbc,ObjectMapper json){this.schedules=schedules;this.jdbc=jdbc;this.json=json;}
    public record Edit(List<CourseScheduleService.Input> terms,String reason){}
    public record History(int revision,String semester,LocalDate firstMonday,String action,String reason,String createdAt){}
    public record HistoryPage(List<History> items,int total,int page,int size){}
    @Transactional(timeout=15)
    public CourseScheduleService.State edit(Long owner,Edit input){
        if(input==null||input.terms()==null||input.terms().isEmpty()||input.terms().size()>2||input.reason()==null||input.reason().isBlank()||input.reason().length()>500)throw error(400,"每次明确修改1至2个学期，并填写修改原因");
        if(!schedules.historyAvailable())throw error(503,"个人课表历史存储尚未启用");
        jdbc.queryForObject("SELECT id FROM users WHERE id=? FOR UPDATE",Long.class,owner);
        var existing=schedules.terms(owner);var targets=new HashSet<LocalDate>();
        for(var target:input.terms()){
            if(target==null||target.firstMonday()==null||!targets.add(target.firstMonday()))throw error(400,"学期目标重复或无效");
            var old=existing.stream().filter(s->s.firstMonday().equals(target.firstMonday())).findFirst().orElse(null);
            if(target.revision()!=(old==null?0:old.revision()))throw error(409,"这个学期已经变化，请保留草稿并重新读取");
        }
        CourseScheduleService.State result=null;
        for(var target:input.terms()){
            var active=schedules.get(owner).schedule();
            result=schedules.saveReviewed(owner,new CourseScheduleService.Input(active==null?0:active.revision(),target.semester(),target.firstMonday(),target.remindDays(),target.courses()),input.reason());
        }
        return result;
    }
    @Transactional(readOnly=true,isolation=org.springframework.transaction.annotation.Isolation.REPEATABLE_READ)
    public HistoryPage history(Long owner,int page){
        if(!schedules.historyAvailable())throw error(503,"历史存储尚未启用");
        if(page<0||page>40000)throw error(400,"页码无效");
        int total=jdbc.queryForObject("SELECT COUNT(*) FROM personal_schedule_history WHERE owner_id=?",Integer.class,owner);
        var rows=jdbc.query("SELECT revision,semester,first_monday,action,reason,created_at FROM personal_schedule_history WHERE owner_id=? ORDER BY revision DESC LIMIT 25 OFFSET ?",(r,n)->new History(r.getInt(1),r.getString(2),r.getDate(3).toLocalDate(),r.getString(4),r.getString(5),r.getTimestamp(6).toInstant().toString()),owner,page*25);
        return new HistoryPage(rows,total,page,25);
    }
    public CourseScheduleService.Snapshot revision(Long owner,int revision){
        if(!schedules.historyAvailable())throw error(503,"历史存储尚未启用");
        var rows=jdbc.query("SELECT snapshot_json FROM personal_schedule_history WHERE owner_id=? AND revision=?",(r,n)->json.readValue(r.getString(1),CourseScheduleService.Snapshot.class),owner,revision);
        if(rows.isEmpty())throw error(404,"没有这个本人的历史版本");return rows.get(0);
    }
    private static ResponseStatusException error(int code,String msg){return new ResponseStatusException(HttpStatus.valueOf(code),msg);}
}
