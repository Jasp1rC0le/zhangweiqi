package com.campusai.material;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.http.*;
import org.springframework.core.io.FileSystemResource;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

@RestController @RequestMapping("/api/private-materials")
public class PrivateMaterialController {
    private final PrivateMaterialService service;
    public PrivateMaterialController(PrivateMaterialService service){this.service=service;}
    @GetMapping("/capabilities") public ResponseEntity<?> capabilities(@RequestAttribute("currentUserId") Long user){return json(service.capabilities(user));}
    @GetMapping public ResponseEntity<?> list(@RequestAttribute("currentUserId") Long user,@RequestParam(defaultValue="0") int page){return json(service.list(user,page));}
    @PostMapping(consumes=MediaType.MULTIPART_FORM_DATA_VALUE) public ResponseEntity<?> save(@RequestAttribute("currentUserId") Long user,@RequestParam String requestId,@RequestPart MultipartFile file,@RequestParam(defaultValue="") String text) throws IOException {return json(service.save(user,requestId,file,text));}
    @GetMapping("/{id}/text") public ResponseEntity<?> text(@RequestAttribute("currentUserId") Long user,@PathVariable String id){return json(java.util.Map.of("text",service.text(user,id)));}
    @GetMapping("/{id}/download") public ResponseEntity<FileSystemResource> download(@RequestAttribute("currentUserId") Long user,@PathVariable String id) throws IOException {
        var result=service.download(user,id);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).header("X-Content-Type-Options","nosniff").header("Content-Security-Policy","sandbox").header("X-Content-SHA256",result.info().sha256())
            .header(HttpHeaders.CONTENT_DISPOSITION,ContentDisposition.attachment().filename(result.info().name(),StandardCharsets.UTF_8).build().toString()).contentType(MediaType.APPLICATION_OCTET_STREAM).contentLength(result.info().bytes()).body(new FileSystemResource(result.path()));
    }
    private static ResponseEntity<?> json(Object result){return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(result);}
}
