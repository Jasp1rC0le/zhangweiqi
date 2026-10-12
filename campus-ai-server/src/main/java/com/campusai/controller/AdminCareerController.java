package com.campusai.controller;

import com.campusai.career.CampusEmployer;
import com.campusai.career.CampusJob;
import com.campusai.career.CareerService;
import com.campusai.career.EmployerCandidate;
import com.campusai.career.EmployerDiscoveryService;
import com.campusai.service.UserService;
import com.campusai.user.entity.User;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import java.util.List;

@RestController
@RequestMapping("/api/admin/career")
public class AdminCareerController {
    private final CareerService career;
    private final UserService users;
    private final EmployerDiscoveryService discovery;

    public AdminCareerController(CareerService career, UserService users,
                                 EmployerDiscoveryService discovery) {
        this.career = career;
        this.users = users;
        this.discovery = discovery;
    }

    @PostMapping("/employer-candidates/discover")
    public List<EmployerCandidate> discoverEmployers(@RequestAttribute("currentUserId") Long userId,
            @RequestAttribute("currentUserRole") String role,
            @Valid @RequestBody DiscoveryInput input) {
        return discovery.discover(school(userId, role), input.keyword());
    }

    @GetMapping("/employer-candidates")
    public List<EmployerCandidate> employerCandidates(@RequestAttribute("currentUserId") Long userId,
            @RequestAttribute("currentUserRole") String role,
            @RequestParam(defaultValue = "PENDING") String status) {
        return discovery.list(school(userId, role), status);
    }

    @PostMapping("/employer-candidates/{id}/import")
    public CampusEmployer importEmployerCandidate(@RequestAttribute("currentUserId") Long userId,
            @RequestAttribute("currentUserRole") String role, @PathVariable Long id,
            @Valid @RequestBody CareerService.EmployerInput input) {
        Long schoolId = school(userId, role);
        return discovery.importCandidate(schoolId, id, userId, input);
    }

    @PostMapping("/employer-candidates/{id}/reject")
    public EmployerCandidate rejectEmployerCandidate(@RequestAttribute("currentUserId") Long userId,
            @RequestAttribute("currentUserRole") String role, @PathVariable Long id) {
        return discovery.reject(school(userId, role), id, userId);
    }

    @GetMapping("/employers")
    public List<CampusEmployer> employers(@RequestAttribute("currentUserId") Long userId,
            @RequestAttribute("currentUserRole") String role) {
        return career.employers(school(userId, role));
    }

    @PostMapping("/employers")
    public CampusEmployer addEmployer(@RequestAttribute("currentUserId") Long userId,
            @RequestAttribute("currentUserRole") String role,
            @Valid @RequestBody CareerService.EmployerInput input) {
        return career.saveEmployer(school(userId, role), null, input);
    }

    @PutMapping("/employers/{id}")
    public CampusEmployer updateEmployer(@RequestAttribute("currentUserId") Long userId,
            @RequestAttribute("currentUserRole") String role, @PathVariable Long id,
            @Valid @RequestBody CareerService.EmployerInput input) {
        return career.saveEmployer(school(userId, role), id, input);
    }

    @PutMapping("/employers/{id}/status")
    public CampusEmployer employerStatus(@RequestAttribute("currentUserId") Long userId,
            @RequestAttribute("currentUserRole") String role, @PathVariable Long id,
            @Valid @RequestBody StatusInput input) {
        return career.publishEmployer(school(userId, role), id, input.published());
    }

    @GetMapping("/jobs")
    public List<CampusJob> jobs(@RequestAttribute("currentUserId") Long userId,
            @RequestAttribute("currentUserRole") String role) {
        return career.jobs(school(userId, role));
    }

    @PostMapping("/jobs")
    public CampusJob addJob(@RequestAttribute("currentUserId") Long userId,
            @RequestAttribute("currentUserRole") String role,
            @Valid @RequestBody CareerService.JobInput input) {
        return career.saveJob(school(userId, role), null, input);
    }

    @PutMapping("/jobs/{id}")
    public CampusJob updateJob(@RequestAttribute("currentUserId") Long userId,
            @RequestAttribute("currentUserRole") String role, @PathVariable Long id,
            @Valid @RequestBody CareerService.JobInput input) {
        return career.saveJob(school(userId, role), id, input);
    }

    @PutMapping("/jobs/{id}/status")
    public CampusJob jobStatus(@RequestAttribute("currentUserId") Long userId,
            @RequestAttribute("currentUserRole") String role, @PathVariable Long id,
            @Valid @RequestBody StatusInput input) {
        return career.publishJob(school(userId, role), id, input.published());
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

    public record StatusInput(@NotNull Boolean published) {}
    public record DiscoveryInput(@Size(max = 120) String keyword) {}
}
