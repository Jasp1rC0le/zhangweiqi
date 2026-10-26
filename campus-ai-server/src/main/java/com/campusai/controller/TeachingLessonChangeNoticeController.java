package com.campusai.controller;

import com.campusai.teaching.TeachingLessonChangeNotices;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/teaching/lesson-change-notices")
public class TeachingLessonChangeNoticeController {
    private final TeachingLessonChangeNotices service;
    public TeachingLessonChangeNoticeController(TeachingLessonChangeNotices service){this.service=service;}
    @GetMapping public ResponseEntity<TeachingLessonChangeNotices.Page> page(@RequestAttribute("currentUserId") long user,@RequestParam(defaultValue="true") boolean unreadOnly,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="25") int size){return response(service.page(user,unreadOnly,page,size));}
    @PostMapping("/{id}/read") public ResponseEntity<TeachingLessonChangeNotices.Notice> read(@RequestAttribute("currentUserId") long user,@PathVariable String id){return response(service.markRead(user,id));}
    private static <T> ResponseEntity<T> response(T body){return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);}
}
