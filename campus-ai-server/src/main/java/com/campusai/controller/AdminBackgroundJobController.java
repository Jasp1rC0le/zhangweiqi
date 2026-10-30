package com.campusai.controller;

import com.campusai.jobs.BackgroundJobRepository;
import com.campusai.service.UserService;
import com.campusai.user.entity.User;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Locale;

@RestController
@RequestMapping("/api/admin/background-jobs")
public class AdminBackgroundJobController {
    private final JdbcTemplate jdbc;
    private final BackgroundJobRepository jobs;
    private final UserService users;
    private final boolean enabled;

    public AdminBackgroundJobController(JdbcTemplate jdbc, BackgroundJobRepository jobs, UserService users,
                                        @Value("${app.jobs.enabled:true}") boolean enabled) {
        this.jdbc = jdbc;
        this.jobs = jobs;
        this.users = users;
        this.enabled = enabled;
    }

    @GetMapping("/runtime")
    public ResponseEntity<RuntimeState> runtime(@RequestAttribute("currentUserId") Long userId,
                                                @RequestAttribute("currentUserRole") String role) {
        school(userId, role);
        // Configuration only: this does not claim a worker heartbeat or successful execution.
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(new RuntimeState(enabled));
    }

    @GetMapping
    public List<JobView> list(@RequestAttribute("currentUserId") Long userId,
                              @RequestAttribute("currentUserRole") String role,
                              @RequestParam(defaultValue = "FAILED") String status) {
        Long schoolId = school(userId, role);
        String normalized = status.trim().toUpperCase(Locale.ROOT);
        if (!List.of("PENDING", "RUNNING", "DONE", "FAILED").contains(normalized)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "任务状态无效");
        }
        return jdbc.query("SELECT id, job_type, ref_id, status, attempt_count, max_attempts, "
                        + "available_at, last_error, updated_at FROM background_jobs "
                        + "WHERE school_id = ? AND status = ? ORDER BY updated_at DESC, id DESC LIMIT 100",
                (result, row) -> new JobView(result.getLong("id"), result.getString("job_type"),
                        (Long) result.getObject("ref_id"), result.getString("status"),
                        result.getInt("attempt_count"), result.getInt("max_attempts"),
                        time(result.getTimestamp("available_at")), result.getString("last_error"),
                        time(result.getTimestamp("updated_at"))), schoolId, normalized);
    }

    @PostMapping("/{id}/retry")
    public void retry(@RequestAttribute("currentUserId") Long userId,
                      @RequestAttribute("currentUserRole") String role,
                      @PathVariable Long id) {
        Long schoolId = school(userId, role);
        if (!enabled) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "后台任务执行已暂停，未重新排队");
        }
        if (!jobs.retryFailed(schoolId, id)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "任务不存在或当前不可重试");
        }
    }

    private Long school(Long userId, String role) {
        if (!"ADMIN".equals(role)) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "需要管理员权限");
        User user = users.getById(userId);
        if (user == null || !"ADMIN".equals(user.getRole()) || user.getStatus() == null
                || user.getStatus() != 1) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "管理员账户无效");
        }
        return user.getSchoolId();
    }

    private LocalDateTime time(java.sql.Timestamp value) {
        return value == null ? null : value.toLocalDateTime();
    }

    public record JobView(Long id, String type, Long refId, String status, int attemptCount,
                          int maxAttempts, LocalDateTime availableAt, String lastError,
                          LocalDateTime updatedAt) {}
    public record RuntimeState(boolean enabled) {}
}
