package com.campusai.controller;

import com.campusai.teaching.TeachingAdministrativeAuditService;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import java.time.LocalDate;
import java.nio.charset.StandardCharsets;
import java.io.IOException;
import jakarta.servlet.http.HttpServletRequest;
import tools.jackson.databind.ObjectMapper;

@RestController @RequestMapping("/api/admin/teaching/operations/audit")
public class TeachingAdministrativeAuditController {
    private final TeachingAdministrativeAuditService service;
    private final ObjectMapper json;
    public TeachingAdministrativeAuditController(TeachingAdministrativeAuditService service){this(service,new ObjectMapper());}
    @org.springframework.beans.factory.annotation.Autowired public TeachingAdministrativeAuditController(TeachingAdministrativeAuditService service,ObjectMapper json){this.service=service;this.json=json;}
    @GetMapping("/access") public ResponseEntity<TeachingAdministrativeAuditService.Access> access(@RequestAttribute("currentUserId")long user){return response(service.access(user));}
    @GetMapping("/page") public ResponseEntity<TeachingAdministrativeAuditService.Page> page(@RequestAttribute("currentUserId")long user,@RequestParam LocalDate from,@RequestParam LocalDate to,@RequestParam(defaultValue="ALL")String kind,@RequestParam(defaultValue="")String search,@RequestParam(defaultValue="0")int page,@RequestParam(defaultValue="25")int size){return response(service.page(user,new TeachingAdministrativeAuditService.Filter(kind,from,to,search),page,size));}
    @GetMapping("/export-preview") public ResponseEntity<TeachingAdministrativeAuditService.Preview> preview(@RequestAttribute("currentUserId")long user,@RequestParam LocalDate from,@RequestParam LocalDate to,@RequestParam(defaultValue="ALL")String kind,@RequestParam(defaultValue="")String search){return response(service.preview(user,new TeachingAdministrativeAuditService.Filter(kind,from,to,search)));}
    @PostMapping(value="/export",consumes="application/json") public ResponseEntity<byte[]> download(@RequestAttribute("currentUserId")long user,HttpServletRequest request)throws IOException{
        var artifact=service.download(user,TeachingController.bounded(json,request,TeachingAdministrativeAuditService.ExportRequest.class));
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).contentType(new MediaType("text","csv",StandardCharsets.UTF_8)).contentLength(artifact.bytes().length)
                .header(HttpHeaders.CONTENT_DISPOSITION,ContentDisposition.attachment().filename(artifact.filename(),StandardCharsets.UTF_8).build().toString()).header("X-Content-SHA256",artifact.sha256()).body(artifact.bytes());
    }
    private <T> ResponseEntity<T> response(T body){return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);}
}
