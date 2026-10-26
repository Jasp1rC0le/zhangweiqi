package com.campusai.controller;
import com.campusai.timetable.*;
import com.campusai.teaching.TeachingService;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import jakarta.servlet.http.HttpServletRequest;
import tools.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

@RestController @RequestMapping("/api/timetable/exports")
public class ScheduleExportController {
    private final ScheduleExportSource source;private final ScheduleExportService service;private final TeachingService teaching;private final ObjectMapper json;
    public ScheduleExportController(ScheduleExportSource source,ScheduleExportService service,TeachingService teaching,ObjectMapper json){this.source=source;this.service=service;this.teaching=teaching;this.json=json;}
    @GetMapping("/access") public ResponseEntity<ScheduleExportSource.Access> access(@RequestAttribute("currentUserId")long user){return response(source.access(user));}
    @GetMapping("/classes/page") public ResponseEntity<TeachingService.ConfigPage> classes(@RequestAttribute("currentUserId")long user,@RequestParam String view,@RequestParam(defaultValue="0")int page,@RequestParam(defaultValue="25")int size,@RequestParam(defaultValue="")String search,@RequestParam(defaultValue="")String selected){return response(teaching.governanceClasses(user,view,page,size,search,selected));}
    @PostMapping(value="/prepare",consumes="application/json") public ResponseEntity<ScheduleExportService.Preview> prepare(@RequestAttribute("currentUserId")long user,HttpServletRequest request)throws IOException{return response(service.prepare(user,TeachingController.bounded(json,request,ScheduleExportSource.Filter.class)));}
    @PostMapping(value="/download",consumes="application/json") public ResponseEntity<byte[]> download(@RequestAttribute("currentUserId")long user,HttpServletRequest request)throws IOException{var file=service.download(user,TeachingController.bounded(json,request,ScheduleExportService.Download.class));return ResponseEntity.ok().cacheControl(CacheControl.noStore()).contentType(MediaType.parseMediaType(file.mime())).contentLength(file.bytes().length).header(HttpHeaders.CONTENT_DISPOSITION,ContentDisposition.attachment().filename(file.filename(),StandardCharsets.UTF_8).build().toString()).header("X-Content-SHA256",file.sha256()).body(file.bytes());}
    private <T>ResponseEntity<T> response(T data){return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(data);}
}
