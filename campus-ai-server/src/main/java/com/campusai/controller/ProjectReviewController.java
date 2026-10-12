package com.campusai.controller;
import com.campusai.project.ProjectReviewService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
public class ProjectReviewController {
    private final ProjectReviewService service;
    public ProjectReviewController(ProjectReviewService service) { this.service=service; }
    public record Invite(@NotBlank @Size(max=36) String requestId,@Min(1) int revision,@NotBlank @Size(max=50) String recipient,boolean includeMaterial,boolean includeData) {}
    public record Review(@NotBlank @Size(max=2000) String note,@NotNull @Size(max=2000) String baseNote) {}
    private <T> ResponseEntity<T> response(T value) { return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(value); }
    @GetMapping("/projects/{projectId}/reviews") public ResponseEntity<?> outgoing(@RequestAttribute("currentUserId") Long user,@PathVariable String projectId) { return response(service.outgoing(user,projectId)); }
    @PostMapping("/projects/{projectId}/reviews") public ResponseEntity<?> create(@RequestAttribute("currentUserId") Long user,@PathVariable String projectId,@Valid @RequestBody Invite input) { return response(service.create(user,projectId,input.requestId(),input.revision(),input.recipient(),input.includeMaterial(),input.includeData())); }
    @DeleteMapping("/projects/{projectId}/reviews/{id}") public ResponseEntity<?> revoke(@RequestAttribute("currentUserId") Long user,@PathVariable String projectId,@PathVariable String id) { service.revoke(user,projectId,id);return ResponseEntity.noContent().build(); }
    @GetMapping("/project-reviews") public ResponseEntity<?> incoming(@RequestAttribute("currentUserId") Long user) { return response(service.incoming(user)); }
    @GetMapping("/project-reviews/{id}") public ResponseEntity<?> detail(@RequestAttribute("currentUserId") Long user,@PathVariable String id) { return response(service.get(user,id)); }
    @PutMapping("/project-reviews/{id}") public ResponseEntity<?> review(@RequestAttribute("currentUserId") Long user,@PathVariable String id,@Valid @RequestBody Review input) { service.review(user,id,input.note(),input.baseNote());return ResponseEntity.noContent().build(); }
}
