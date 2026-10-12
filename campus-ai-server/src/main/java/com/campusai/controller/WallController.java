package com.campusai.controller;

import com.campusai.wall.*;
import com.campusai.service.UserService;
import com.campusai.user.entity.User;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import java.util.List;

@RestController
public class WallController {
    private final WallService wall;
    private final UserService users;
    private final WallThrottle throttle;
    public WallController(WallService wall,UserService users,WallThrottle throttle) { this.wall=wall;this.users=users;this.throttle=throttle; }
    private User user(Long id,boolean admin) {
        User u=users.getById(id);
        if(u==null||u.getStatus()==null||u.getStatus()!=1) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,"请先登录");
        if(u.getSchoolId()==null) throw new ResponseStatusException(HttpStatus.FORBIDDEN,"请先完善学校信息");
        if(admin&&!"ADMIN".equals(u.getRole())) throw new ResponseStatusException(HttpStatus.FORBIDDEN,"需要管理员权限");
        return u;
    }
    @GetMapping("/api/wall") public WallService.Page list(@RequestAttribute("currentUserId") Long id,@RequestParam(defaultValue="") String category,@RequestParam(defaultValue="false") boolean mine,@RequestParam(defaultValue="0") int offset) { return wall.list(user(id,false).getSchoolId(),id,category,mine,offset); }
    @GetMapping("/api/wall/{entry}") public WallService.Entry get(@RequestAttribute("currentUserId") Long id,@PathVariable String entry) { return wall.get(user(id,false).getSchoolId(),id,entry); }
    @PostMapping("/api/wall") public WallService.Entry create(@RequestAttribute("currentUserId") Long id,@Valid @RequestBody WallService.Input input) { User u=user(id,false);throttle.check(id);return wall.create(u.getSchoolId(),id,input); }
    @GetMapping("/api/wall/{entry}/comments") public WallService.Page comments(@RequestAttribute("currentUserId") Long id,@PathVariable String entry,@RequestParam(defaultValue="0") int offset) { return wall.comments(user(id,false).getSchoolId(),id,entry,offset); }
    @PostMapping("/api/wall/{entry}/comments") public WallService.Entry comment(@RequestAttribute("currentUserId") Long id,@PathVariable String entry,@Valid @RequestBody WallService.CommentInput input) { User u=user(id,false);throttle.check(id);return wall.comment(u.getSchoolId(),id,entry,input); }
    public record Like(@NotNull Boolean liked) {}
    @PutMapping("/api/wall/{entry}/like") public void like(@RequestAttribute("currentUserId") Long id,@PathVariable String entry,@Valid @RequestBody Like input) { User u=user(id,false);throttle.check(id);wall.like(u.getSchoolId(),id,entry,input.liked()); }
    @DeleteMapping("/api/wall/{entry}") public void remove(@RequestAttribute("currentUserId") Long id,@PathVariable String entry) { User u=user(id,false);throttle.check(id);wall.remove(u.getSchoolId(),id,entry); }
    public record ReportInput(@NotNull @Size(max=32) String reason) {}
    @PostMapping("/api/wall/{entry}/report") public void report(@RequestAttribute("currentUserId") Long id,@PathVariable String entry,@Valid @RequestBody ReportInput input) { User u=user(id,false);throttle.check(id);wall.report(u.getSchoolId(),id,entry,input.reason()); }
    @GetMapping("/api/admin/wall") public List<WallService.Entry> queue(@RequestAttribute("currentUserId") Long id) { return wall.queue(user(id,true).getSchoolId(),id); }
    @GetMapping("/api/admin/wall/reports") public List<WallService.Report> reports(@RequestAttribute("currentUserId") Long id) { return wall.reports(user(id,true).getSchoolId()); }
    @GetMapping("/api/admin/wall/{entry}") public WallService.Entry context(@RequestAttribute("currentUserId") Long id,@PathVariable String entry) { return wall.moderationContext(user(id,true).getSchoolId(),id,entry); }
    @PutMapping("/api/admin/wall/{entry}") public void review(@RequestAttribute("currentUserId") Long id,@PathVariable String entry,@Valid @RequestBody WallService.ReviewInput input) { User u=user(id,true);wall.review(u.getSchoolId(),id,entry,input); }
}
