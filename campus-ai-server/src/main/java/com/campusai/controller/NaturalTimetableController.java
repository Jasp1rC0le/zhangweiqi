package com.campusai.controller;

import com.campusai.timetable.NaturalTimetableService;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/timetable/unified")
public class NaturalTimetableController {
    private final NaturalTimetableService service;
    public NaturalTimetableController(NaturalTimetableService service){this.service=service;}
    @PostMapping("/ask")
    public ResponseEntity<NaturalTimetableService.Response> ask(@RequestAttribute("currentUserId") long user,@RequestBody NaturalTimetableService.Request request){
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.ask(user,request));
    }
}
