package com.campusai.controller;
import com.campusai.teaching.TeachingLessonChangeService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import tools.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.time.LocalDate;

@RestController @RequestMapping("/api/admin/teaching/lesson-changes")
public class TeachingLessonChangeController {
    private final TeachingLessonChangeService service;private final ObjectMapper json;
    public TeachingLessonChangeController(TeachingLessonChangeService service,ObjectMapper json){this.service=service;this.json=json;}
    @GetMapping("/access") public ResponseEntity<TeachingLessonChangeService.Access> access(@RequestAttribute("currentUserId")long actor){return response(service.access(actor));}
    @GetMapping("/target/{id}") public ResponseEntity<TeachingLessonChangeService.Target> target(@RequestAttribute("currentUserId")long actor,@PathVariable String id){return response(service.target(actor,id));}
    @GetMapping("/page") public ResponseEntity<TeachingLessonChangeService.Options> page(@RequestAttribute("currentUserId")long actor,@RequestParam LocalDate from,@RequestParam LocalDate to,@RequestParam(defaultValue="0")int page,@RequestParam(defaultValue="25")int size,@RequestParam(defaultValue="")String search){return response(service.page(actor,from,to,page,size,search));}
    @PostMapping(value="/preview",consumes="application/json") public ResponseEntity<TeachingLessonChangeService.Preview> preview(@RequestAttribute("currentUserId")long actor,HttpServletRequest request)throws IOException{return response(service.preview(actor,TeachingController.bounded(json,request,TeachingLessonChangeService.Input.class)));}
    @PostMapping(consumes="application/json") public ResponseEntity<TeachingLessonChangeService.Receipt> change(@RequestAttribute("currentUserId")long actor,HttpServletRequest request)throws IOException{return response(service.change(actor,TeachingController.bounded(json,request,TeachingLessonChangeService.Input.class)));}
    @GetMapping("/requests/{id}") public ResponseEntity<TeachingLessonChangeService.Receipt> request(@RequestAttribute("currentUserId")long actor,@PathVariable String id){return response(service.request(actor,id));}
    private <T> ResponseEntity<T> response(T value){return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(value);}
}
