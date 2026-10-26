package com.campusai.controller;

import com.campusai.teaching.TeachingService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/teaching")
public class TeachingController {
    private final TeachingService service;
    private final ObjectMapper json;
    public TeachingController(TeachingService service,ObjectMapper json) { this.service=service; this.json=json; }
    private <T> ResponseEntity<T> response(T body) { return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body); }
    @GetMapping("/access") public ResponseEntity<TeachingService.Access> access(@RequestAttribute("currentUserId") long user) { return response(service.access(user)); }
    @GetMapping("/lessons") public ResponseEntity<List<TeachingService.Lesson>> lessons(@RequestAttribute("currentUserId") long user,@RequestParam String view,@RequestParam LocalDate from,@RequestParam LocalDate to) { return response(service.lessons(user,view,from,to)); }
    @GetMapping("/lessons/page") public ResponseEntity<TeachingService.LessonPage> lessonPage(@RequestAttribute("currentUserId") long user,@RequestParam String view,@RequestParam LocalDate from,@RequestParam LocalDate to,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="50") int size,@RequestParam(defaultValue="") String search) { return response(service.lessonPage(user,view,from,to,null,page,size,search)); }
    @GetMapping("/lessons/{id}") public ResponseEntity<TeachingService.Detail> detail(@RequestAttribute("currentUserId") long user,@PathVariable String id,@RequestParam String view) { return response(service.detail(user,view,id)); }
    @GetMapping("/lessons/{id}/page") public ResponseEntity<TeachingService.DetailPage> detailPage(@RequestAttribute("currentUserId") long user,@PathVariable String id,@RequestParam String view,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="50") int size,@RequestParam(defaultValue="") String search) { return response(service.detailPage(user,view,id,page,size,search)); }
    @PutMapping(value="/lessons/{id}/attendance/page",consumes="application/json") public ResponseEntity<TeachingService.DetailPage> markPage(@RequestAttribute("currentUserId") long user,@PathVariable String id,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="50") int size,@RequestParam(defaultValue="") String search,HttpServletRequest request) throws IOException { return response(service.markPage(user,id,bounded(json,request,TeachingService.RollCall.class),page,size,search)); }
    @GetMapping("/lessons/{id}/audit") public ResponseEntity<TeachingService.AuditPage> audit(@RequestAttribute("currentUserId") long user,@PathVariable String id,@RequestParam String view,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="25") int size) { return response(service.auditPage(user,view,id,page,size)); }
    @PutMapping(value="/lessons/{id}/attendance",consumes="application/json") public ResponseEntity<TeachingService.Detail> mark(@RequestAttribute("currentUserId") long user,@PathVariable String id,HttpServletRequest request) throws IOException { return response(service.mark(user,id,bounded(json,request,TeachingService.RollCall.class))); }
    @GetMapping("/notices") public ResponseEntity<List<TeachingService.Notice>> notices(@RequestAttribute("currentUserId") long user) { return response(service.notices(user)); }
    @PostMapping("/notices/{id}/read") public ResponseEntity<Void> read(@RequestAttribute("currentUserId") long user,@PathVariable String id) { service.readNotice(user,id); return response(null); }
    @GetMapping("/my-day") public ResponseEntity<TeachingService.DayAnswer> day(@RequestAttribute("currentUserId") long user,@RequestParam(required=false) LocalDate date) { return response(service.myDay(user,date)); }
    static <T> T bounded(ObjectMapper json,HttpServletRequest request,Class<T> type) throws IOException {
        byte[] bytes=request.getInputStream().readNBytes(100001);
        if(bytes.length>100000) throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE,"教学资料限100KB，请拆分后再提交");
        try { return json.readerFor(type).with(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES).without(DeserializationFeature.ACCEPT_FLOAT_AS_INT).readValue(bytes); }
        catch(Exception failure) { throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"教学资料格式无效，请核对预览"); }
    }
}
