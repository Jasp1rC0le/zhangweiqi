package com.campusai.knowledge.importing;

import com.campusai.dto.CreateKnowledgeDocumentRequest;
import com.campusai.dto.KnowledgeImportPreview;
import com.campusai.dto.KnowledgeImportResponse;
import com.campusai.knowledge.entity.KnowledgeDocument;
import com.campusai.mapper.KnowledgeDocumentMapper;
import com.campusai.service.KnowledgeDocumentService;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.HexFormat;
import java.util.List;
import java.util.Objects;

@Service
public class KnowledgeSourceRefreshService {
    private final KnowledgeImportPreviewService previews;
    private final KnowledgeDocumentMapper documents;
    private final KnowledgeDocumentService documentService;
    private final JdbcTemplate jdbc;

    public KnowledgeSourceRefreshService(KnowledgeImportPreviewService previews,
                                         KnowledgeDocumentMapper documents,
                                         KnowledgeDocumentService documentService,
                                         JdbcTemplate jdbc) {
        this.previews = previews;
        this.documents = documents;
        this.documentService = documentService;
        this.jdbc = jdbc;
    }

    public void check(Long schoolId, Long documentId) {
        KnowledgeDocument document = documents.findByIdAndSchoolId(documentId, schoolId);
        if (document == null || !"PUBLISHED".equals(document.getStatus())
                || document.getSourceUrl() == null || document.getSourceUrl().isBlank()) {
            throw new IllegalArgumentException("document is not refreshable");
        }
        KnowledgeImportPreview preview = previews.url(schoolId, document.getSourceUrl());
        String content = normalize(preview.content());
        String detectedHash = sha256(content);
        String reviewedSourceHash = reviewedSourceHash(schoolId, documentId, document.getSourceUrl());
        // Knowledge text may be a curated summary. Only a reviewed fetched snapshot is a source baseline.
        // Never borrow an unrelated document's review just because its URL happens to match.
        if (detectedHash.equals(reviewedSourceHash)
                || (reviewedSourceHash == null && detectedHash.equals(document.getContentHash()))) return;
        // Fetching can take seconds. Never queue a response against a retired or edited baseline.
        KnowledgeDocument latest = documents.findByIdAndSchoolId(documentId, schoolId);
        if (latest == null || !"PUBLISHED".equals(latest.getStatus())
                || !Objects.equals(document.getContentHash(), latest.getContentHash())
                || !Objects.equals(document.getSourceUrl(), latest.getSourceUrl())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "来源检查期间原资料已变化，请重新检查");
        }
        List<String> existingStatuses = jdbc.queryForList("SELECT status FROM knowledge_update_candidates "
                        + "WHERE document_id = ? AND school_id = ? AND detected_hash = ?",
                String.class, documentId, schoolId, detectedHash);
        if (!existingStatuses.isEmpty() && !"PENDING".equals(existingStatuses.get(0))) {
            // The legacy unique key cannot represent A -> B -> A without overwriting review history.
            // Fail visibly instead of pretending this rollback was checked or silently reusing A's old decision.
            throw new ResponseStatusException(HttpStatus.CONFLICT, "官网正文回到已处理的历史快照，请人工核对原文和资料");
        }
        jdbc.update("INSERT INTO knowledge_update_candidates "
                        + "(school_id, document_id, source_url, detected_title, detected_content, "
                        + "previous_hash, detected_hash) VALUES (?, ?, ?, ?, ?, ?, ?) "
                        + "ON DUPLICATE KEY UPDATE detected_at = CURRENT_TIMESTAMP",
                schoolId, documentId, document.getSourceUrl(), preview.title(), content,
                document.getContentHash(), detectedHash);
    }

    private String reviewedSourceHash(Long schoolId, Long documentId, String sourceUrl) {
        List<String> hashes = jdbc.queryForList("SELECT candidate.detected_hash "
                        + "FROM knowledge_update_candidates candidate "
                        + "INNER JOIN knowledge_documents reviewed_document "
                        + "ON reviewed_document.id = candidate.document_id AND reviewed_document.school_id = candidate.school_id "
                        + "INNER JOIN knowledge_documents current_document "
                        + "ON current_document.id = ? AND current_document.school_id = candidate.school_id "
                        + "LEFT JOIN knowledge_document_versions reviewed_version ON reviewed_version.document_id = reviewed_document.id "
                        + "LEFT JOIN knowledge_document_versions current_version ON current_version.document_id = current_document.id "
                        + "WHERE candidate.school_id = ? AND candidate.source_url = ? "
                        + "AND candidate.status IN ('APPLIED', 'DISMISSED') "
                        + "AND candidate.reviewed_by IS NOT NULL AND candidate.reviewed_at IS NOT NULL "
                        + "AND COALESCE(reviewed_version.root_document_id, reviewed_document.id) "
                        + "= COALESCE(current_version.root_document_id, current_document.id) "
                        + "ORDER BY candidate.reviewed_at DESC, candidate.id DESC LIMIT 1",
                String.class, documentId, schoolId, sourceUrl);
        if (hashes.isEmpty()) return null;
        String hash = hashes.get(0);
        return hash != null && hash.matches("[0-9a-f]{64}") ? hash : null;
    }

    public List<KnowledgeUpdateCandidate> pending(Long schoolId) {
        return jdbc.query("SELECT candidate.id, candidate.document_id, candidate.source_url, "
                        + "document.title current_title, candidate.detected_title, "
                        + "candidate.detected_content, candidate.status, candidate.detected_at "
                        + "FROM knowledge_update_candidates candidate INNER JOIN knowledge_documents document "
                        + "ON document.id = candidate.document_id WHERE candidate.school_id = ? "
                        + "AND candidate.status = 'PENDING' ORDER BY candidate.detected_at DESC LIMIT 100",
                (result, row) -> new KnowledgeUpdateCandidate(result.getLong("id"),
                        result.getLong("document_id"), result.getString("source_url"),
                        result.getString("current_title"), result.getString("detected_title"),
                        result.getString("detected_content"), result.getString("status"),
                        time(result.getTimestamp("detected_at"))), schoolId);
    }

    @Transactional
    public KnowledgeImportResponse apply(Long schoolId, Long candidateId, Long actorId) {
        CandidateData candidate = findCandidate(schoolId, candidateId);
        KnowledgeDocument previous = documents.findLockedByIdAndSchoolId(candidate.documentId(), schoolId);
        if (previous == null || !"PUBLISHED".equals(previous.getStatus())
                || !Objects.equals(candidate.previousHash(), previous.getContentHash())
                || !Objects.equals(candidate.sourceUrl(), previous.getSourceUrl())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "原资料已变化，请重新检查来源");
        }
        if (candidate.detectedContent() == null
                || !Objects.equals(candidate.detectedHash(), sha256(normalize(candidate.detectedContent())))) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "来源候选正文校验失败，请重新检查来源");
        }
        CreateKnowledgeDocumentRequest request = new CreateKnowledgeDocumentRequest();
        request.setSchoolId(schoolId);
        request.setTitle(candidate.detectedTitle());
        request.setCategory(previous.getCategory());
        request.setSourceDepartment(previous.getSourceDepartment());
        request.setSourceUrl(candidate.sourceUrl());
        request.setPublishedAt(previous.getPublishedAt());
        request.setEffectiveAt(previous.getEffectiveAt());
        request.setExpiresAt(previous.getExpiresAt());
        request.setContent(candidate.detectedContent());
        KnowledgeImportResponse response = documentService.revise(
                schoolId, previous.getId(), actorId, request);
        int updated = jdbc.update("UPDATE knowledge_update_candidates SET status = 'APPLIED', reviewed_by = ?, "
                        + "reviewed_at = CURRENT_TIMESTAMP WHERE id = ? AND school_id = ? AND status = 'PENDING'",
                actorId, candidateId, schoolId);
        if (updated != 1) throw new ResponseStatusException(HttpStatus.CONFLICT, "更新候选已变化，请重新读取");
        return response;
    }

    public void dismiss(Long schoolId, Long candidateId, Long actorId) {
        int updated = jdbc.update("UPDATE knowledge_update_candidates SET status = 'DISMISSED', "
                        + "reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP "
                        + "WHERE id = ? AND school_id = ? AND status = 'PENDING'",
                actorId, candidateId, schoolId);
        if (updated != 1) throw new ResponseStatusException(HttpStatus.CONFLICT, "更新候选不存在或已处理");
    }

    private CandidateData findCandidate(Long schoolId, Long id) {
        List<CandidateData> rows = jdbc.query("SELECT document_id, source_url, detected_title, "
                        + "detected_content, previous_hash, detected_hash FROM knowledge_update_candidates "
                        + "WHERE id = ? AND school_id = ? AND status = 'PENDING' FOR UPDATE",
                (result, row) -> new CandidateData(result.getLong("document_id"),
                        result.getString("source_url"), result.getString("detected_title"),
                        result.getString("detected_content"), result.getString("previous_hash"),
                        result.getString("detected_hash")), id, schoolId);
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.CONFLICT, "更新候选不存在或已处理");
        return rows.get(0);
    }

    private String normalize(String content) {
        return content.replace("\r\n", "\n").replace('\r', '\n').trim();
    }

    private String sha256(String content) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(content.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException(exception);
        }
    }

    private LocalDateTime time(Timestamp value) {
        return value == null ? null : value.toLocalDateTime();
    }

    private record CandidateData(Long documentId, String sourceUrl, String detectedTitle,
                                 String detectedContent, String previousHash, String detectedHash) {}
}
