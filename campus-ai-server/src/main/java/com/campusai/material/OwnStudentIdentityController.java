package com.campusai.material;
import com.campusai.teaching.TeachingService;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController
public class OwnStudentIdentityController {
    private final JdbcTemplate jdbc;private final MaterialCommandService auth;private final TeachingService teaching;
    public OwnStudentIdentityController(JdbcTemplate jdbc,MaterialCommandService auth,TeachingService teaching){this.jdbc=jdbc;this.auth=auth;this.teaching=teaching;}
    @GetMapping("/api/account/student-identity")
    public ResponseEntity<?> identity(@RequestAttribute("currentUserId") Long user){
        var actor=auth.actor(user,false);var access=teaching.access(user);
        if(!access.enabled()||!access.views().contains("STUDENT"))return result(Map.of("bound",false,"message","尚未通过学校教学数据绑定本人的学号；不会根据用户名、姓名或上传文件猜测身份"));
        var rows=jdbc.query("SELECT s.student_number,b.name FROM teaching_students s JOIN teaching_classes b ON b.id=s.class_id AND b.school_id=s.school_id WHERE s.user_id=? AND s.school_id=? LIMIT 2",(r,n)->Map.of("studentNumber",r.getString(1),"className",r.getString(2)),user,actor.schoolId());
        if(rows.size()!=1)throw new org.springframework.web.server.ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"本人教学身份不唯一或缺失，请管理员核对绑定；没有按同名认领");
        return result(Map.of("bound",true,"studentNumber",rows.get(0).get("studentNumber"),"className",rows.get(0).get("className")));
    }
    private static ResponseEntity<?> result(Object body){return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);}
}
