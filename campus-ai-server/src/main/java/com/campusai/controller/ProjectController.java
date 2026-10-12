package com.campusai.controller;

import com.campusai.project.ProjectContent;
import com.campusai.project.ProjectService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/projects")
public class ProjectController {
    private final ProjectService projects;
    public ProjectController(ProjectService projects) { this.projects = projects; }
    public record Create(@NotBlank @Size(max=36) String id, @NotNull @Valid ProjectContent content) {}
    public record Save(@Min(1) int revision, boolean archived, @NotNull @Valid ProjectContent content) {}
    private <T> ResponseEntity<T> privateResponse(T value) { return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(value); }
    @GetMapping public ResponseEntity<List<ProjectService.Summary>> list(@RequestAttribute("currentUserId") Long userId) { return privateResponse(projects.list(userId)); }
    public record Capabilities(int dataSheetVersion, int reviewFeedbackVersion, int calculationVersion) {}
    @GetMapping("/capabilities") public ResponseEntity<Capabilities> capabilities() { return privateResponse(new Capabilities(1, 1, 1)); }
    @GetMapping("/{id}") public ResponseEntity<ProjectService.Project> get(@RequestAttribute("currentUserId") Long userId, @PathVariable String id) { return privateResponse(projects.get(userId, id)); }
    @PostMapping public ResponseEntity<ProjectService.Project> create(@RequestAttribute("currentUserId") Long userId, @Valid @RequestBody Create input) { return privateResponse(projects.create(userId, input.id(), input.content())); }
    @PutMapping("/{id}") public ResponseEntity<ProjectService.Project> save(@RequestAttribute("currentUserId") Long userId, @PathVariable String id, @Valid @RequestBody Save input) { return privateResponse(projects.save(userId, id, input.revision(), input.content(), input.archived())); }
    @GetMapping("/{id}/versions") public ResponseEntity<List<ProjectService.Version>> versions(@RequestAttribute("currentUserId") Long userId, @PathVariable String id) { return privateResponse(projects.versions(userId, id)); }
    @GetMapping("/{id}/versions/{revision}") public ResponseEntity<ProjectContent> version(@RequestAttribute("currentUserId") Long userId, @PathVariable String id, @PathVariable int revision) { return privateResponse(projects.version(userId, id, revision)); }
    @DeleteMapping("/{id}") public ResponseEntity<Void> delete(@RequestAttribute("currentUserId") Long userId, @PathVariable String id, @RequestParam int revision) { projects.delete(userId, id, revision); return ResponseEntity.noContent().build(); }
}
