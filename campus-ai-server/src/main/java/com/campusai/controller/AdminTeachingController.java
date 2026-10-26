package com.campusai.controller;

import com.campusai.teaching.TeachingService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import tools.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.util.Map;
import java.util.List;

@RestController
@RequestMapping("/api/admin/teaching")
public class AdminTeachingController {
    private final TeachingService service;
    private final ObjectMapper json;
    public AdminTeachingController(TeachingService service,ObjectMapper json) { this.service=service; this.json=json; }
    @GetMapping("/classes") public ResponseEntity<List<TeachingService.ClassRow>> classes(@RequestAttribute("currentUserId") long actor) { return response(service.classes(actor)); }
    @GetMapping("/capabilities") public ResponseEntity<TeachingService.Capabilities> capabilities(@RequestAttribute("currentUserId") long actor) { return response(service.capabilities(actor)); }
    @GetMapping("/scopes/page") public ResponseEntity<TeachingService.ConfigPage> scopes(@RequestAttribute("currentUserId") long actor,
            @RequestParam(defaultValue="CLASS") String kind,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="25") int size,
            @RequestParam(required=false) String search,@RequestParam(required=false) String selected) {
        return response(service.configurationPage(actor,kind,page,size,search,selected));
    }
    @GetMapping("/classes/{id}/members") public ResponseEntity<List<TeachingService.MemberRow>> members(@RequestAttribute("currentUserId") long actor,@PathVariable String id) { return response(service.members(actor,id)); }
    @PutMapping(value="/members/{id}/account",consumes="application/json") public ResponseEntity<Void> bindMember(@RequestAttribute("currentUserId") long actor,@PathVariable String id,HttpServletRequest request) throws IOException {
        service.bindMember(actor,id,TeachingController.bounded(json,request,TeachingService.AccountBinding.class)); return response(null);
    }
    @PostMapping(value="/classes",consumes="application/json") public ResponseEntity<Map<String,String>> addClass(@RequestAttribute("currentUserId") long actor,HttpServletRequest request) throws IOException {
        return response(Map.of("id",service.createClass(actor,TeachingController.bounded(json,request,TeachingService.ClassInput.class))));
    }
    @PostMapping(value="/courses",consumes="application/json") public ResponseEntity<Map<String,String>> addCourse(@RequestAttribute("currentUserId") long actor,HttpServletRequest request) throws IOException {
        return response(Map.of("id",service.createCourse(actor,TeachingController.bounded(json,request,TeachingService.CourseInput.class))));
    }
    @PostMapping(value="/courses/preview",consumes="application/json") public ResponseEntity<TeachingService.CourseDraftPreview> coursePreview(@RequestAttribute("currentUserId") long actor,HttpServletRequest request)throws IOException{return response(service.previewCourse(actor,TeachingController.bounded(json,request,TeachingService.CourseDraft.class)));}
    @PostMapping(value="/courses/roster",consumes="application/json") public ResponseEntity<Map<String,String>> addRosterCourse(@RequestAttribute("currentUserId") long actor,HttpServletRequest request) throws IOException {
        return response(Map.of("id",service.createRosterCourse(actor,TeachingController.bounded(json,request,TeachingService.RosterCourseInput.class))));
    }
    @GetMapping("/courses/{id}/roster") public ResponseEntity<TeachingService.CourseRoster> courseRoster(@RequestAttribute("currentUserId") long actor,@PathVariable String id) { return response(service.courseRoster(actor,id)); }
    @GetMapping("/courses/{id}/definition") public ResponseEntity<TeachingService.CourseDefinition> courseDefinition(@RequestAttribute("currentUserId") long actor,@PathVariable String id){return response(service.courseDefinition(actor,id));}
    @GetMapping("/courses/{id}/members/{student}/status") public ResponseEntity<TeachingService.CourseMember> courseMember(@RequestAttribute("currentUserId") long actor,@PathVariable String id,@PathVariable String student) {return response(service.courseMember(actor,id,student));}
    @GetMapping("/courses/{id}/roster/page") public ResponseEntity<TeachingService.CourseRosterPage> courseRosterPage(@RequestAttribute("currentUserId") long actor,@PathVariable String id,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="50") int size,@RequestParam(defaultValue="") String search,@RequestParam(defaultValue="false") boolean activeOnly) {return response(service.courseRosterPage(actor,id,page,size,search,activeOnly));}
    @PostMapping(value="/courses/{id}/members/{student}/withdraw",consumes="application/json") public ResponseEntity<Map<String,Object>> withdraw(@RequestAttribute("currentUserId") long actor,@PathVariable String id,@PathVariable String student,HttpServletRequest request) throws IOException {
        int revision=service.withdrawMember(actor,id,student,TeachingController.bounded(json,request,TeachingService.WithdrawInput.class));
        return response(Map.of("id",id,"studentId",student,"revision",revision));
    }
    @PostMapping(value="/grants",consumes="application/json") public ResponseEntity<Void> grant(@RequestAttribute("currentUserId") long actor,HttpServletRequest request) throws IOException {
        service.grant(actor,TeachingController.bounded(json,request,TeachingService.GrantInput.class),false); return response(null);
    }
    @PostMapping(value="/grants/revoke",consumes="application/json") public ResponseEntity<Void> revoke(@RequestAttribute("currentUserId") long actor,HttpServletRequest request) throws IOException {
        service.grant(actor,TeachingController.bounded(json,request,TeachingService.GrantInput.class),true); return response(null);
    }
    @PostMapping("/lessons/{id}/cancel") public ResponseEntity<Void> cancel(@RequestAttribute("currentUserId") long actor,@PathVariable String id,@RequestParam int revision) { service.cancel(actor,id,revision); return response(null); }
    private <T> ResponseEntity<T> response(T body) { return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body); }
}
