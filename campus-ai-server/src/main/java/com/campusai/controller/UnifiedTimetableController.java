package com.campusai.controller;

import com.campusai.timetable.UnifiedTimetableService;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import java.time.LocalDate;
import java.time.LocalDateTime;

@RestController
@RequestMapping("/api/timetable/unified")
public class UnifiedTimetableController {
    private final UnifiedTimetableService service;
    public UnifiedTimetableController(UnifiedTimetableService service) { this.service=service; }
    @GetMapping("/scopes") public ResponseEntity<UnifiedTimetableService.Scopes> scopes(@RequestAttribute("currentUserId") long user,@RequestParam(required=false) String view) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.scopes(user,view));
    }
    @GetMapping("/scopes/page") public ResponseEntity<UnifiedTimetableService.ScopePage> scopePage(@RequestAttribute("currentUserId") long user,@RequestParam(required=false) String view,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="50") int size,@RequestParam(defaultValue="") String search) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.scopePage(user,view,page,size,search));
    }
    @GetMapping("/page") public ResponseEntity<UnifiedTimetableService.WeekPage> page(@RequestAttribute("currentUserId") long user,@RequestParam(required=false) String view,@RequestParam(required=false) LocalDate monday,@RequestParam(required=false) String classId,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="50") int size) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.page(user,view,monday,classId,page,size));
    }
    @GetMapping public ResponseEntity<UnifiedTimetableService.Week> week(@RequestAttribute("currentUserId") long user,@RequestParam(required=false) String view,@RequestParam(required=false) LocalDate monday,@RequestParam(required=false) String classId) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.week(user,view,monday,classId));
    }
    @GetMapping("/day") public ResponseEntity<UnifiedTimetableService.DayAnswer> day(@RequestAttribute("currentUserId") long user,@RequestParam(required=false) LocalDate date) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.day(user,date));
    }
    @GetMapping("/query") public ResponseEntity<com.campusai.timetable.ScheduleQueryEngine.Answer> query(@RequestAttribute("currentUserId") long user,
            @RequestParam LocalDate from,@RequestParam LocalDate to,@RequestParam(defaultValue="ALL") String period,
            @RequestParam(defaultValue="ALL") String selection,@RequestParam(defaultValue="SUMMARY") String detail,@RequestParam(required=false) LocalDateTime anchor,@RequestParam(defaultValue="") String course,
            @RequestParam(required=false) String perspective) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.query(user,from,to,period,selection,detail,anchor,course,perspective==null?"AUTO":perspective));
    }
}
