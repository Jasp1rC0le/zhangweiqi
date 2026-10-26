package com.campusai.controller;

import com.campusai.teaching.TeachingIdentityService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import tools.jackson.databind.ObjectMapper;
import java.io.IOException;

@RestController
public class TeachingIdentityController {
    private final TeachingIdentityService service;
    private final ObjectMapper json;
    public TeachingIdentityController(TeachingIdentityService service,ObjectMapper json) { this.service=service;this.json=json; }
    private <T> ResponseEntity<T> response(T body) { return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body); }
    @GetMapping("/api/account/teaching-identities") public ResponseEntity<TeachingIdentityService.Mine> mine(@RequestAttribute("currentUserId") long user) { return response(service.mine(user)); }
    @PostMapping(value="/api/account/teaching-identities",consumes="application/json")
    public ResponseEntity<TeachingIdentityService.Item> apply(@RequestAttribute("currentUserId") long user,HttpServletRequest request) throws IOException {
        return response(service.apply(user,TeachingController.bounded(json,request,TeachingIdentityService.Apply.class)));
    }
    @GetMapping("/api/admin/teaching-identities") public ResponseEntity<TeachingIdentityService.Page> page(@RequestAttribute("currentUserId") long actor,
            @RequestParam(defaultValue="PENDING") String status,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="25") int size,@RequestParam(defaultValue="") String search) {
        return response(service.pending(actor,status,page,size,search));
    }
    @PostMapping(value="/api/admin/teaching-identities/{id}/review",consumes="application/json")
    public ResponseEntity<TeachingIdentityService.Item> review(@RequestAttribute("currentUserId") long actor,@PathVariable String id,HttpServletRequest request) throws IOException {
        return response(service.review(actor,id,TeachingController.bounded(json,request,TeachingIdentityService.Review.class)));
    }
}
