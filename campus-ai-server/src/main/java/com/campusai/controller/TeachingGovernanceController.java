package com.campusai.controller;

import com.campusai.teaching.TeachingGovernanceService;
import com.campusai.teaching.TeachingService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import tools.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;

@RestController @RequestMapping("/api/teaching/governance")
public class TeachingGovernanceController {
    private final TeachingGovernanceService service;private final TeachingService teaching;private final ObjectMapper json;
    public TeachingGovernanceController(TeachingGovernanceService service,TeachingService teaching,ObjectMapper json){this.service=service;this.teaching=teaching;this.json=json;}
    @GetMapping("/access") public ResponseEntity<TeachingGovernanceService.Access> access(@RequestAttribute("currentUserId")long user){return response(service.access(user));}
    @GetMapping("/classes/page") public ResponseEntity<TeachingService.ConfigPage> classes(@RequestAttribute("currentUserId")long user,@RequestParam String view,@RequestParam(defaultValue="0")int page,@RequestParam(defaultValue="25")int size,@RequestParam(defaultValue="")String search,@RequestParam(defaultValue="")String selected){return response(teaching.governanceClasses(user,view,page,size,search,selected));}
    @GetMapping("/page") public ResponseEntity<TeachingGovernanceService.Page> page(@RequestAttribute("currentUserId")long user,@RequestParam String view,@RequestParam LocalDate from,@RequestParam LocalDate to,@RequestParam(defaultValue="")String classId,@RequestParam(defaultValue="ATTENDANCE")String kind,@RequestParam(defaultValue="false")boolean expiredOnly,@RequestParam(defaultValue="0")int page,@RequestParam(defaultValue="25")int size){return response(service.page(user,new TeachingGovernanceService.Filter(view,from,to,classId,kind,expiredOnly),page,size));}
    @GetMapping("/export-preview") public ResponseEntity<TeachingGovernanceService.Preview> preview(@RequestAttribute("currentUserId")long user,@RequestParam String view,@RequestParam LocalDate from,@RequestParam LocalDate to,@RequestParam(defaultValue="")String classId,@RequestParam(defaultValue="ATTENDANCE")String kind,@RequestParam(defaultValue="false")boolean expiredOnly){return response(service.preview(user,new TeachingGovernanceService.Filter(view,from,to,classId,kind,expiredOnly)));}
    @PostMapping(value="/export",consumes="application/json") public ResponseEntity<byte[]> download(@RequestAttribute("currentUserId")long user,HttpServletRequest request)throws IOException{
        var value=service.download(user,TeachingController.bounded(json,request,TeachingGovernanceService.ExportRequest.class));
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).contentType(new MediaType("text","csv",StandardCharsets.UTF_8)).contentLength(value.bytes().length)
                .header(HttpHeaders.CONTENT_DISPOSITION,ContentDisposition.attachment().filename(value.filename(),StandardCharsets.UTF_8).build().toString()).header("X-Content-SHA256",value.sha256()).body(value.bytes());
    }
    private <T> ResponseEntity<T> response(T value){return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(value);}
}
