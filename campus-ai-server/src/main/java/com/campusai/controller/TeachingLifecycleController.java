package com.campusai.controller;
import com.campusai.teaching.TeachingLifecycleService;
import com.campusai.teaching.TeachingReenrollmentService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import tools.jackson.databind.ObjectMapper;
import java.io.IOException;
@RestController @RequestMapping("/api/admin/teaching")
public class TeachingLifecycleController {
    private final TeachingLifecycleService service;private final TeachingReenrollmentService reenrollment;private final ObjectMapper json;
    public TeachingLifecycleController(TeachingLifecycleService service,TeachingReenrollmentService reenrollment,ObjectMapper json){this.service=service;this.reenrollment=reenrollment;this.json=json;}
    @GetMapping("/students/{id}/status") public ResponseEntity<TeachingLifecycleService.Student> status(@RequestAttribute("currentUserId") long actor,@PathVariable String id){return response(service.status(actor,id));}
    @PostMapping(value="/students/{id}/transition",consumes="application/json") public ResponseEntity<TeachingLifecycleService.Receipt> transition(@RequestAttribute("currentUserId") long actor,@PathVariable String id,HttpServletRequest request)throws IOException{return response(service.transition(actor,id,TeachingController.bounded(json,request,TeachingLifecycleService.Transition.class)));}
    @PostMapping(value="/courses/{id}/members/{student}/reenroll",consumes="application/json") public ResponseEntity<TeachingReenrollmentService.Receipt> reenroll(@RequestAttribute("currentUserId") long actor,@PathVariable String id,@PathVariable String student,HttpServletRequest request)throws IOException{return response(reenrollment.reenroll(actor,id,student,TeachingController.bounded(json,request,TeachingReenrollmentService.Input.class)));}
    @PutMapping(value="/courses/{id}/enrollment-mode",consumes="application/json") public ResponseEntity<Void> mode(@RequestAttribute("currentUserId") long actor,@PathVariable String id,HttpServletRequest request)throws IOException{service.reviewMode(actor,id,TeachingController.bounded(json,request,TeachingLifecycleService.ModeReview.class));return response(null);}
    @GetMapping("/courses/{id}/enrollment-mode") public ResponseEntity<TeachingLifecycleService.ModeState> modeStatus(@RequestAttribute("currentUserId")long actor,@PathVariable String id){return response(service.modeStatus(actor,id));}
    @PostMapping(value="/courses/{id}/enrollment-mode/review",consumes="application/json") public ResponseEntity<TeachingLifecycleService.ModeReceipt> reviewMode(@RequestAttribute("currentUserId")long actor,@PathVariable String id,HttpServletRequest request)throws IOException{return response(service.reviewModeReceipt(actor,id,TeachingController.bounded(json,request,TeachingLifecycleService.ModeRequest.class)));}
    private <T> ResponseEntity<T> response(T body){return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);}
}
