package com.campusai.controller;

import com.campusai.dto.CreateKnowledgeDocumentRequest;
import com.campusai.dto.KnowledgeImportResponse;
import com.campusai.dto.KnowledgeImportPreview;
import com.campusai.dto.KnowledgeSitePreviewResponse;
import com.campusai.dto.CreateKnowledgeEvaluationCaseRequest;
import com.campusai.dto.KnowledgeEvaluationReport;
import com.campusai.knowledge.entity.KnowledgeDocument;
import com.campusai.knowledge.model.KnowledgeEvaluationCase;
import com.campusai.knowledge.semantic.KnowledgeSemanticService;
import com.campusai.knowledge.importing.KnowledgeImportPreviewService;
import com.campusai.knowledge.importing.KnowledgeSourceRefreshService;
import com.campusai.knowledge.importing.KnowledgeUpdateCandidate;
import com.campusai.jobs.BackgroundJobRepository;
import com.campusai.service.KnowledgeDocumentService;
import com.campusai.service.UserService;
import com.campusai.service.impl.KnowledgeEvaluationService;
import com.campusai.user.entity.User;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import java.util.List;

@RestController
@RequestMapping("/api/admin/knowledge")
public class AdminKnowledgeController {

    private final KnowledgeDocumentService documentService;
    private final KnowledgeEvaluationService evaluationService;
    private final UserService userService;
    private final KnowledgeSemanticService semanticService;
    private final KnowledgeImportPreviewService previewService;
    private final KnowledgeSourceRefreshService refreshService;
    private final BackgroundJobRepository jobs;

    public AdminKnowledgeController(
            KnowledgeDocumentService documentService,
            KnowledgeEvaluationService evaluationService,
            UserService userService,
            KnowledgeSemanticService semanticService,
            KnowledgeImportPreviewService previewService,
            KnowledgeSourceRefreshService refreshService,
            BackgroundJobRepository jobs) {

        this.documentService = documentService;
        this.evaluationService = evaluationService;
        this.userService = userService;
        this.semanticService = semanticService;
        this.previewService = previewService;
        this.refreshService = refreshService;
        this.jobs = jobs;
    }

    @PostMapping(value = "/preview-files", consumes = "multipart/form-data")
    public List<KnowledgeImportPreview> previewFiles(
            @RequestAttribute("currentUserId") Long userId,
            @RequestAttribute("currentUserRole") String role,
            @RequestPart("files") MultipartFile[] files) {
        return previewService.files(requireAdmin(userId, role).getSchoolId(), files);
    }

    @PostMapping("/preview-url")
    public KnowledgeImportPreview previewUrl(
            @RequestAttribute("currentUserId") Long userId,
            @RequestAttribute("currentUserRole") String role,
            @Valid @RequestBody PreviewUrlRequest request) {
        return previewService.url(requireAdmin(userId, role).getSchoolId(), request.url());
    }

    @PostMapping("/preview-site")
    public KnowledgeSitePreviewResponse previewSite(
            @RequestAttribute("currentUserId") Long userId,
            @RequestAttribute("currentUserRole") String role,
            @Valid @RequestBody PreviewSiteRequest request) {
        return previewService.site(requireAdmin(userId, role).getSchoolId(), request.url(),
                request.maxPages(), request.maxDepth(), request.restrictToPath());
    }

    @GetMapping("/update-candidates")
    public List<KnowledgeUpdateCandidate> updateCandidates(
            @RequestAttribute("currentUserId") Long userId,
            @RequestAttribute("currentUserRole") String role) {
        return refreshService.pending(requireAdmin(userId, role).getSchoolId());
    }

    @PostMapping("/documents/{id}/check-update")
    public ResponseEntity<Void> checkUpdate(
            @RequestAttribute("currentUserId") Long userId,
            @RequestAttribute("currentUserRole") String role, @PathVariable Long id) {
        Long schoolId = requireAdmin(userId, role).getSchoolId();
        KnowledgeDocument document = documentService.findOne(schoolId, id);
        if (!"PUBLISHED".equals(document.getStatus()) || document.getSourceUrl() == null
                || document.getSourceUrl().isBlank()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "只有带官网来源的已发布资料可以检查更新");
        }
        jobs.enqueueKnowledgeRefreshNow(schoolId, id);
        return ResponseEntity.accepted().build();
    }

    @PostMapping("/update-candidates/{id}/apply")
    public KnowledgeImportResponse applyUpdate(
            @RequestAttribute("currentUserId") Long userId,
            @RequestAttribute("currentUserRole") String role, @PathVariable Long id) {
        User admin = requireAdmin(userId, role);
        return refreshService.apply(admin.getSchoolId(), id, userId);
    }

    @PostMapping("/update-candidates/{id}/dismiss")
    public ResponseEntity<Void> dismissUpdate(
            @RequestAttribute("currentUserId") Long userId,
            @RequestAttribute("currentUserRole") String role, @PathVariable Long id) {
        User admin = requireAdmin(userId, role);
        refreshService.dismiss(admin.getSchoolId(), id, userId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/documents/batch")
    public List<KnowledgeImportResponse> importBatch(
            @RequestAttribute("currentUserId") Long userId,
            @RequestAttribute("currentUserRole") String role,
            @Valid @RequestBody List<@Valid CreateKnowledgeDocumentRequest> requests) {
        return documentService.importBatch(requireAdmin(userId, role).getSchoolId(), requests);
    }

    @PostMapping("/documents/revisions/batch")
    public List<KnowledgeImportResponse> reviseBatch(
            @RequestAttribute("currentUserId") Long userId,
            @RequestAttribute("currentUserRole") String role,
            @Valid @RequestBody List<@Valid RevisionRequest> requests) {
        Long schoolId = requireAdmin(userId, role).getSchoolId();
        return documentService.reviseBatch(schoolId, userId,
                requests.stream().map(item -> new KnowledgeDocumentService.RevisionInput(
                        item.documentId(), item.document())).toList());
    }

    @PostMapping("/documents")
    public ResponseEntity<KnowledgeImportResponse>
    importDocument(
            @RequestAttribute("currentUserId") Long currentUserId,
            @RequestAttribute("currentUserRole")
            String currentUserRole,

            @Valid
            @RequestBody
            CreateKnowledgeDocumentRequest request) {

        User admin = requireAdmin(currentUserId, currentUserRole);
        if (!admin.getSchoolId().equals(request.getSchoolId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "只能导入本校资料");
        }

        KnowledgeImportResponse response =
                documentService.importDocument(
                        request
                );

        if (response.duplicate()) {
            return ResponseEntity.ok(response);
        }

        return ResponseEntity
                .status(HttpStatus.CREATED)
                .body(response);
    }

    @GetMapping("/documents")
    public List<KnowledgeDocument> documents(
            @RequestAttribute("currentUserId") Long userId,
            @RequestAttribute("currentUserRole") String role) {
        return documentService.findRecent(requireAdmin(userId, role).getSchoolId());
    }

    @GetMapping("/documents/{id}")
    public KnowledgeDocument document(
            @RequestAttribute("currentUserId") Long userId,
            @RequestAttribute("currentUserRole") String role, @PathVariable Long id) {
        return documentService.findOne(requireAdmin(userId, role).getSchoolId(), id);
    }

    @GetMapping("/documents/page")
    public KnowledgeDocumentService.DocumentPage documentPage(@RequestAttribute("currentUserId") Long userId,@RequestAttribute("currentUserRole") String role,
            @RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="25") int size,@RequestParam(defaultValue="") String search) {
        return documentService.editablePage(requireAdmin(userId,role).getSchoolId(),page,size,search);
    }

    @GetMapping("/documents/scan")
    public List<KnowledgeDocument> scanDocuments(
            @RequestAttribute("currentUserId") Long userId,
            @RequestAttribute("currentUserRole") String role,
            @RequestParam(required = false) Long beforeId) {
        return documentService.scan(requireAdmin(userId, role).getSchoolId(), beforeId);
    }

    @GetMapping("/documents/{id}/versions")
    public List<KnowledgeDocument> versions(
            @RequestAttribute("currentUserId") Long userId,
            @RequestAttribute("currentUserRole") String role, @PathVariable Long id) {
        return documentService.findVersions(requireAdmin(userId, role).getSchoolId(), id);
    }

    @PostMapping("/documents/{id}/revisions")
    public KnowledgeImportResponse revise(
            @RequestAttribute("currentUserId") Long userId,
            @RequestAttribute("currentUserRole") String role,
            @PathVariable Long id, @Valid @RequestBody CreateKnowledgeDocumentRequest request) {
        return documentService.revise(requireAdmin(userId, role).getSchoolId(), id, userId, request);
    }

    @PutMapping("/documents/{id}/status")
    public KnowledgeDocument changeStatus(
            @RequestAttribute("currentUserId") Long userId,
            @RequestAttribute("currentUserRole") String role,
            @PathVariable Long id, @Valid @RequestBody ChangeStatusRequest request) {
        if (request.published() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "缺少状态");
        }
        return documentService.setPublished(requireAdmin(userId, role).getSchoolId(),
                id, userId, request.published(), request.note());
    }

    @GetMapping("/evaluation-cases")
    public List<KnowledgeEvaluationCase> evaluationCases(
            @RequestAttribute("currentUserId") Long userId,
            @RequestAttribute("currentUserRole") String role) {
        return evaluationService.list(requireAdmin(userId, role).getSchoolId());
    }

    @PostMapping("/evaluation-cases")
    public KnowledgeEvaluationCase addEvaluationCase(
            @RequestAttribute("currentUserId") Long userId,
            @RequestAttribute("currentUserRole") String role,
            @Valid @RequestBody CreateKnowledgeEvaluationCaseRequest request) {
        return evaluationService.add(requireAdmin(userId, role).getSchoolId(), request);
    }

    @DeleteMapping("/evaluation-cases/{id}")
    public ResponseEntity<Void> deleteEvaluationCase(
            @RequestAttribute("currentUserId") Long userId,
            @RequestAttribute("currentUserRole") String role, @PathVariable Long id) {
        evaluationService.delete(requireAdmin(userId, role).getSchoolId(), id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/evaluate")
    public KnowledgeEvaluationReport evaluate(
            @RequestAttribute("currentUserId") Long userId,
            @RequestAttribute("currentUserRole") String role) {
        return evaluationService.run(requireAdmin(userId, role).getSchoolId());
    }

    @PostMapping("/semantic-index/next")
    public IndexResult indexNext(
            @RequestAttribute("currentUserId") Long userId,
            @RequestAttribute("currentUserRole") String role) {
        Long schoolId = requireAdmin(userId, role).getSchoolId();
        return new IndexResult(semanticService.indexNextBatch(schoolId));
    }

    private User requireAdmin(Long userId, String role) {
        if (!"ADMIN".equals(role)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "需要管理员权限");
        }
        User user = userService.getById(userId);
        if (user == null || !"ADMIN".equals(user.getRole()) || user.getStatus() == null
                || user.getStatus() != 1) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "管理员账户无效");
        }
        return user;
    }

    public record ChangeStatusRequest(Boolean published, @Size(max = 500) String note) {}
    public record IndexResult(int indexedChunks) {}
    public record PreviewUrlRequest(@NotBlank String url) {}
    public record PreviewSiteRequest(@NotBlank String url,
                                     @Min(1) @Max(20) int maxPages,
                                     @Min(0) @Max(3) int maxDepth,
                                     boolean restrictToPath) {}
    public record RevisionRequest(@jakarta.validation.constraints.NotNull Long documentId,
                                  @Valid @jakarta.validation.constraints.NotNull
                                  CreateKnowledgeDocumentRequest document) {}
}
