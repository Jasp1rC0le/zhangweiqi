package com.campusai.controller;

import com.campusai.timetable.TimetableService;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;

@RestController
@RequestMapping("/api/timetable")
public class TimetableController {
    private final TimetableService service;
    private final ObjectMapper json;
    public TimetableController(TimetableService service, ObjectMapper json) { this.service = service; this.json = json; }
    private <T> ResponseEntity<T> privateResponse(T value) { return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(value); }
    @GetMapping public ResponseEntity<TimetableService.State> get(@RequestAttribute("currentUserId") Long userId) { return privateResponse(service.get(userId)); }
    @GetMapping("/image") public ResponseEntity<byte[]> image(@RequestAttribute("currentUserId") Long userId, @RequestParam int revision) {
        var image = service.image(userId, revision);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).contentType(MediaType.parseMediaType(image.mime()))
                .header("X-Content-Type-Options", "nosniff").body(image.bytes());
    }
    @PutMapping(consumes="multipart/form-data") public ResponseEntity<TimetableService.State> save(@RequestAttribute("currentUserId") Long userId,
            @RequestPart("metadata") MultipartFile metadata, @RequestPart("image") MultipartFile image) throws java.io.IOException {
        if (metadata.getSize() > 2000 || image.getSize() > TimetableService.MAX_IMAGE_BYTES)
            throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "课表文件或说明过大，请精简后重试");
        TimetableService.Input input;
        try { input = json.readValue(metadata.getBytes(), TimetableService.Input.class); }
        catch (Exception e) { throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "课表日期或说明格式无效，请重新填写"); }
        return privateResponse(service.save(userId, input, image.getBytes()));
    }
    @PostMapping("/checked") public ResponseEntity<TimetableService.State> checked(@RequestAttribute("currentUserId") Long userId, @RequestParam int revision) {
        return privateResponse(service.checked(userId, revision));
    }
    @DeleteMapping public ResponseEntity<Void> delete(@RequestAttribute("currentUserId") Long userId, @RequestParam int revision) {
        service.delete(userId, revision);
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
    }
}
