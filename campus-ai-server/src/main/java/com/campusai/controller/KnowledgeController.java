package com.campusai.controller;

import com.campusai.knowledge.model.KnowledgeSearchResult;
import com.campusai.service.KnowledgeSearchService;
import com.campusai.service.UserService;
import com.campusai.user.entity.User;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@Validated
@RestController
@RequestMapping("/api/knowledge")
public class KnowledgeController {

    private final KnowledgeSearchService searchService;
    private final UserService userService;

    public KnowledgeController(
            KnowledgeSearchService searchService,
            UserService userService) {

        this.searchService = searchService;
        this.userService = userService;
    }

    @GetMapping("/search")
    public ResponseEntity<List<KnowledgeSearchResult>>
    search(
            @RequestAttribute("currentUserId")
            Long currentUserId,

            @RequestParam
            @NotBlank(message = "搜索关键词不能为空")
            @Size(
                    max = 100,
                    message = "搜索关键词不能超过100个字符"
            )
            String keyword) {

        User currentUser = userService.getById(currentUserId);

        List<KnowledgeSearchResult> results =
                searchService.search(
                        currentUser.getSchoolId(),
                        keyword
                );

        return ResponseEntity.ok(results);
    }
}
