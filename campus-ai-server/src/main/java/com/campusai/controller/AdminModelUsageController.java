package com.campusai.controller;

import com.campusai.dto.ModelUsageSummaryResponse;
import com.campusai.ai.usage.AiCostEstimator;
import com.campusai.mapper.AiModelUsageMapper;
import com.campusai.service.UserService;
import com.campusai.user.entity.User;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@RestController
@RequestMapping("/api/admin/model-usage")
public class AdminModelUsageController {

    private final AiModelUsageMapper usageMapper;
    private final UserService userService;
    private final AiCostEstimator costs;

    public AdminModelUsageController(
            AiModelUsageMapper usageMapper,
            UserService userService) {
        this(usageMapper, userService, null);
    }

    @org.springframework.beans.factory.annotation.Autowired
    public AdminModelUsageController(AiModelUsageMapper usageMapper,
            UserService userService, AiCostEstimator costs) {
        this.usageMapper = usageMapper;
        this.userService = userService;
        this.costs = costs;
    }

    @GetMapping
    public ResponseEntity<List<ModelUsageSummaryResponse>> recentSummary(
            @RequestAttribute("currentUserId") Long currentUserId,
            @RequestAttribute("currentUserRole") String currentUserRole) {

        if (!"ADMIN".equals(currentUserRole)) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "需要管理员权限"
            );
        }

        User admin = userService.getById(currentUserId);
        if (admin == null) {
            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED,
                    "管理员账户不存在"
            );
        }

        if (!"ADMIN".equals(admin.getRole()) || admin.getStatus() == null
                || admin.getStatus() != 1) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "需要管理员权限"
            );
        }

        List<ModelUsageSummaryResponse> summary = usageMapper.findRecentSummaryBySchoolId(admin.getSchoolId());
        if (costs != null) {
            summary.forEach(item -> item.setEstimatedCostCny(costs.estimate(
                    item.getProvider(), item.getModel(), item.getPromptTokens(), item.getCompletionTokens())));
        }
        return ResponseEntity.ok(summary);
    }
}
