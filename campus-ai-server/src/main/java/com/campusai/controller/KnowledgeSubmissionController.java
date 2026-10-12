package com.campusai.controller;

import com.campusai.dto.CreateKnowledgeSubmissionRequest;
import com.campusai.dto.KnowledgeSubmissionResponse;
import com.campusai.service.KnowledgeSubmissionService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/knowledge-submissions")
public class KnowledgeSubmissionController {

    private final KnowledgeSubmissionService submissionService;

    public KnowledgeSubmissionController(
            KnowledgeSubmissionService submissionService) {
        this.submissionService = submissionService;
    }

    @PostMapping
    public ResponseEntity<KnowledgeSubmissionResponse> submit(
            @RequestAttribute("currentUserId") Long currentUserId,
            @Valid @RequestBody CreateKnowledgeSubmissionRequest request) {

        return ResponseEntity
                .status(HttpStatus.CREATED)
                .body(submissionService.submit(currentUserId, request));
    }

    @GetMapping("/mine")
    public ResponseEntity<List<KnowledgeSubmissionResponse>> findMine(
            @RequestAttribute("currentUserId") Long currentUserId) {

        return ResponseEntity.ok(
                submissionService.findMine(currentUserId)
        );
    }
}
