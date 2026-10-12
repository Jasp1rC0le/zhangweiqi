package com.campusai.controller;

import com.campusai.ai.usage.AiDailyQuotaService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/ai/quota")
public class AiQuotaController {
    private final AiDailyQuotaService quota;

    public AiQuotaController(AiDailyQuotaService quota) { this.quota = quota; }

    @GetMapping
    public AiDailyQuotaService.DailyQuota status(@RequestAttribute("currentUserId") Long userId) {
        return quota.status(userId);
    }
    @GetMapping("/activity")
    public java.util.List<AiDailyQuotaService.Activity> activity(@RequestAttribute("currentUserId") Long userId) { return quota.activity(userId); }
}
