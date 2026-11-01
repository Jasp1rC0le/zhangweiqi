package com.campusai.controller;

import com.campusai.timetable.CalendarLinkService;
import com.campusai.security.AuthSessionService;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import java.nio.charset.StandardCharsets;

@RestController
public class CalendarLinkController {
    private final CalendarLinkService service;
    private final AuthSessionService sessions;
    public CalendarLinkController(CalendarLinkService service,AuthSessionService sessions){this.service=service;this.sessions=sessions;}
    public record Input(int minutes){}
    @GetMapping("/api/timetable/calendar-link")
    public ResponseEntity<CalendarLinkService.Link> status(@RequestAttribute("currentUserId")long user,@RequestAttribute("currentSessionId")String session,@RequestAttribute("currentUserRole")String role){return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.status(user,()->sessions.active(session,user,role)));}
    @PostMapping(value="/api/timetable/calendar-link",consumes="application/json")
    public ResponseEntity<CalendarLinkService.Link> enable(@RequestAttribute("currentUserId")long user,@RequestAttribute("currentSessionId")String session,@RequestAttribute("currentUserRole")String role,@RequestBody Input input){if(input==null)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"请选择提醒时间");return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.enable(user,input.minutes(),()->sessions.active(session,user,role)));}
    @DeleteMapping("/api/timetable/calendar-link")
    public ResponseEntity<Void> revoke(@RequestAttribute("currentUserId")long user,@RequestAttribute("currentSessionId")String session,@RequestAttribute("currentUserRole")String role){service.revoke(user,()->sessions.active(session,user,role));return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();}
    @GetMapping("/api/calendar-feed/{token}/calendar.ics")
    public ResponseEntity<byte[]> calendar(@PathVariable String token){
        try{
            var file=service.read(token);
            return ResponseEntity.ok().cacheControl(CacheControl.noStore()).contentType(MediaType.parseMediaType("text/calendar;charset=UTF-8"))
                    .header(HttpHeaders.CONTENT_DISPOSITION,ContentDisposition.inline().filename("Campthink课表.ics",StandardCharsets.UTF_8).build().toString())
                    .header("X-Content-SHA256",file.sha()).header("Referrer-Policy","no-referrer").contentLength(file.bytes().length).body(file.bytes());
        }catch(ResponseStatusException failure){
            int code=failure.getStatusCode().value();if(!java.util.Set.of(404,410,413,429,503).contains(code))code=503;
            return ResponseEntity.status(code).cacheControl(CacheControl.noStore()).header("Referrer-Policy","no-referrer").header("Retry-After","60").body(new byte[0]);
        }catch(java.io.IOException|RuntimeException failure){return ResponseEntity.status(503).cacheControl(CacheControl.noStore()).header("Retry-After","60").body(new byte[0]);}
    }
}
