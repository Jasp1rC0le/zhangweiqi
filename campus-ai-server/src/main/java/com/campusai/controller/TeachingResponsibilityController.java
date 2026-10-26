package com.campusai.controller;

import com.campusai.teaching.TeachingResponsibilityService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import tools.jackson.databind.ObjectMapper;
import java.io.IOException;

@RestController
@RequestMapping("/api/admin/teaching/responsibilities")
public class TeachingResponsibilityController {
    private final TeachingResponsibilityService service;private final ObjectMapper json;
    public TeachingResponsibilityController(TeachingResponsibilityService service,ObjectMapper json){this.service=service;this.json=json;}
    private <T> ResponseEntity<T> response(T body){return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);}
    @GetMapping("/access") public ResponseEntity<TeachingResponsibilityService.Access> access(@RequestAttribute("currentUserId") long actor){return response(service.access(actor));}
    @GetMapping("/check") public ResponseEntity<TeachingResponsibilityService.Target> check(@RequestAttribute("currentUserId") long actor,@RequestParam long userId,@RequestParam String viewRole,@RequestParam String scopeKey){return response(service.check(actor,userId,viewRole,scopeKey));}
    @GetMapping("/page") public ResponseEntity<TeachingResponsibilityService.Page> page(@RequestAttribute("currentUserId") long actor,@RequestParam long userId,@RequestParam String viewRole,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="25") int size){return response(service.page(actor,userId,viewRole,page,size));}
    @GetMapping("/requests/{id}") public ResponseEntity<TeachingResponsibilityService.Receipt> request(@RequestAttribute("currentUserId") long actor,@PathVariable String id){return response(service.request(actor,id));}
    @PostMapping(value="/change",consumes="application/json") public ResponseEntity<TeachingResponsibilityService.Receipt> change(@RequestAttribute("currentUserId") long actor,HttpServletRequest request)throws IOException{return response(service.change(actor,TeachingController.bounded(json,request,TeachingResponsibilityService.Change.class)));}
}
