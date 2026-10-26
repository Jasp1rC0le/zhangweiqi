package com.campusai.controller;

import com.campusai.timetable.CourseScheduleService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.DeserializationFeature;

@RestController
@RequestMapping("/api/timetable/courses")
public class CourseScheduleController {
    private final CourseScheduleService service;
    private final ObjectMapper json;
    public CourseScheduleController(CourseScheduleService service, ObjectMapper json) { this.service = service; this.json = json; }
    private <T> ResponseEntity<T> response(T body) { return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body); }
    @GetMapping public ResponseEntity<CourseScheduleService.State> get(@RequestAttribute("currentUserId") Long userId) { return response(service.get(userId)); }
    @PutMapping(consumes = "application/json") public ResponseEntity<CourseScheduleService.State> save(@RequestAttribute("currentUserId") Long userId, HttpServletRequest request) throws java.io.IOException {
        // Bound the bytes before JSON parsing, including chunked requests with unknown content length.
        byte[] bytes = request.getInputStream().readNBytes(CourseScheduleService.MAX_BODY_BYTES + 1);
        if (bytes.length > CourseScheduleService.MAX_BODY_BYTES) throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "课程表格超过100KB，请精简后重试");
        CourseScheduleService.Input input;
        try { input = json.readerFor(CourseScheduleService.Input.class)
                .without(DeserializationFeature.ACCEPT_FLOAT_AS_INT)
                .with(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES).readValue(bytes); }
        catch (Exception failure) { throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "课程表格格式无效，请重新核对预览"); }
        return response(service.save(userId, input));
    }
    @PostMapping("/checked") public ResponseEntity<CourseScheduleService.State> checked(@RequestAttribute("currentUserId") Long userId, @RequestParam int revision) { return response(service.checked(userId, revision)); }
    @DeleteMapping public ResponseEntity<Void> delete(@RequestAttribute("currentUserId") Long userId, @RequestParam int revision) { service.delete(userId, revision); return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build(); }
}
