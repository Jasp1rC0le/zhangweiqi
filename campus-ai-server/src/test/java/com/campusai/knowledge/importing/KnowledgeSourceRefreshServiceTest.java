package com.campusai.knowledge.importing;

import com.campusai.dto.KnowledgeImportPreview;
import com.campusai.dto.CreateKnowledgeDocumentRequest;
import com.campusai.dto.KnowledgeImportResponse;
import com.campusai.knowledge.entity.KnowledgeDocument;
import com.campusai.mapper.KnowledgeDocumentMapper;
import com.campusai.service.KnowledgeDocumentService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.List;
import java.sql.ResultSet;
import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.startsWith;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@Timeout(10)
class KnowledgeSourceRefreshServiceTest {
    private final KnowledgeImportPreviewService previews = mock(KnowledgeImportPreviewService.class);
    private final KnowledgeDocumentMapper documents = mock(KnowledgeDocumentMapper.class);
    private final KnowledgeDocumentService documentService = mock(KnowledgeDocumentService.class);
    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final KnowledgeSourceRefreshService service = new KnowledgeSourceRefreshService(
            previews, documents, documentService, jdbc);

    @Test
    void unchangedSourceDoesNotCreateCandidate() throws Exception {
        KnowledgeDocument document = document("unchanged");
        when(documents.findByIdAndSchoolId(11L, 7L)).thenReturn(document);
        when(previews.url(7L, document.getSourceUrl())).thenReturn(new KnowledgeImportPreview(
                "通知", "unchanged", document.getSourceUrl(), "URL", 11L, List.of()));

        service.check(7L, 11L);

        verify(jdbc, never()).update(anyString(), any(Object[].class));
    }

    @Test
    void changedSourceCreatesReviewCandidate() throws Exception {
        KnowledgeDocument document = document("old");
        when(documents.findByIdAndSchoolId(11L, 7L)).thenReturn(document);
        when(previews.url(7L, document.getSourceUrl())).thenReturn(new KnowledgeImportPreview(
                "新通知", "new content", document.getSourceUrl(), "URL", null, List.of(11L)));

        service.check(7L, 11L);

        verify(jdbc).update(anyString(), any(Object[].class));
    }

    @Test
    void reviewedRawSnapshotIsComparedToSourceInsteadOfCuratedSummary() throws Exception {
        sourceCheck("人工整理摘要", "官网完整正文");
        reviewedSnapshot(hash("官网完整正文"));
        service.check(7L, 11L);
        verify(jdbc, never()).update(anyString(), any(Object[].class));
    }

    @Test
    void sourceChangeIsDetectedEvenWhenNewRawTextEqualsKnowledgeSummary() throws Exception {
        sourceCheck("新版原文", "新版原文");
        reviewedSnapshot(hash("旧版原文"));
        service.check(7L, 11L);
        verify(jdbc).update(anyString(), any(Object[].class));
    }

    @Test
    void corruptOrMissingReviewedHashDoesNotSuppressSourceReview() throws Exception {
        sourceCheck("人工摘要", "官网正文");
        reviewedSnapshot("not-a-hash");
        service.check(7L, 11L);
        verify(jdbc).update(anyString(), any(Object[].class));
    }

    @Test
    void previouslyReviewedSourceReappearanceFailsWithoutOverwritingAudit() throws Exception {
        sourceCheck("人工摘要", "曾经忽略的原文");
        reviewedSnapshot(hash("最近核对的不同原文"));
        when(jdbc.queryForList(startsWith("SELECT status FROM knowledge_update_candidates"),
                eq(String.class), eq(11L), eq(7L), eq(hash("曾经忽略的原文"))))
                .thenReturn(List.of("DISMISSED"));
        assertConflict(() -> service.check(7L, 11L));
        verify(jdbc, never()).update(anyString(), any(Object[].class));
    }

    private void sourceCheck(String summary, String raw) throws Exception {
        KnowledgeDocument document = document(summary);
        when(documents.findByIdAndSchoolId(11L, 7L)).thenReturn(document);
        when(previews.url(7L, document.getSourceUrl())).thenReturn(new KnowledgeImportPreview(
                "官网通知", raw, document.getSourceUrl(), "URL", null, List.of()));
    }

    private void reviewedSnapshot(String hash) {
        when(jdbc.queryForList(startsWith("SELECT candidate.detected_hash"),
                eq(String.class), eq(11L), eq(7L), eq("https://www.tsguas.edu.cn/notice.html")))
                .thenReturn(List.of(hash));
    }

    @Test
    void retiredDuringFetchDoesNotQueueStaleCandidate() throws Exception {
        KnowledgeDocument before = document("old");
        KnowledgeDocument retired = document("old");
        retired.setStatus("ARCHIVED");
        when(documents.findByIdAndSchoolId(11L, 7L)).thenReturn(before, retired);
        when(previews.url(7L, before.getSourceUrl())).thenReturn(new KnowledgeImportPreview(
                "新通知", "new content", before.getSourceUrl(), "URL", null, List.of()));
        assertConflict(() -> service.check(7L, 11L));
        verify(jdbc, never()).update(anyString(), any(Object[].class));
    }

    @Test
    void sourceEditedDuringFetchDoesNotQueueStaleCandidate() throws Exception {
        KnowledgeDocument before = document("old");
        KnowledgeDocument edited = document("old");
        edited.setSourceUrl("https://www.tsguas.edu.cn/new.html");
        when(documents.findByIdAndSchoolId(11L, 7L)).thenReturn(before, edited);
        when(previews.url(7L, before.getSourceUrl())).thenReturn(new KnowledgeImportPreview(
                "新通知", "new content", before.getSourceUrl(), "URL", null, List.of()));
        assertConflict(() -> service.check(7L, 11L));
        verify(jdbc, never()).update(anyString(), any(Object[].class));
    }

    @Test
    void contentEditedDuringFetchDoesNotQueueStaleCandidate() throws Exception {
        KnowledgeDocument before = document("old");
        when(documents.findByIdAndSchoolId(11L, 7L)).thenReturn(before, document("edited"));
        when(previews.url(7L, before.getSourceUrl())).thenReturn(new KnowledgeImportPreview(
                "新通知", "new content", before.getSourceUrl(), "URL", null, List.of()));
        assertConflict(() -> service.check(7L, 11L));
        verify(jdbc, never()).update(anyString(), any(Object[].class));
    }

    @Test
    void missingOrOtherSchoolCandidateCannotPublish() {
        when(jdbc.query(anyString(), any(RowMapper.class), eq(29L), eq(7L))).thenReturn(List.of());
        assertConflict(() -> service.apply(7L, 29L, 3L));
        verify(documents, never()).findLockedByIdAndSchoolId(any(), any());
        verify(documentService, never()).revise(any(), any(), any(), any());
    }

    @Test
    void appliesMatchingCandidateWithoutExtendingDatesOrLosingMetadata() throws Exception {
        KnowledgeDocument baseline = document("old");
        baseline.setTitle("已审标题");
        baseline.setCategory("办事");
        baseline.setSourceDepartment("教务处");
        baseline.setPublishedAt(LocalDateTime.of(2024, 9, 1, 0, 0));
        baseline.setEffectiveAt(LocalDateTime.of(2024, 9, 2, 0, 0));
        baseline.setExpiresAt(LocalDateTime.of(2026, 11, 10, 0, 0));
        candidate(baseline, "new content", hash("new content"));
        when(documentService.revise(eq(7L), eq(11L), eq(3L), any()))
                .thenReturn(new KnowledgeImportResponse(42L, 1, false));
        when(jdbc.update(anyString(), any(Object[].class))).thenReturn(1);

        assertThat(service.apply(7L, 29L, 3L).documentId()).isEqualTo(42L);
        ArgumentCaptor<CreateKnowledgeDocumentRequest> request = ArgumentCaptor.forClass(CreateKnowledgeDocumentRequest.class);
        verify(documentService).revise(eq(7L), eq(11L), eq(3L), request.capture());
        assertThat(request.getValue().getCategory()).isEqualTo("办事");
        assertThat(request.getValue().getSourceDepartment()).isEqualTo("教务处");
        assertThat(request.getValue().getPublishedAt()).isEqualTo(baseline.getPublishedAt());
        assertThat(request.getValue().getEffectiveAt()).isEqualTo(baseline.getEffectiveAt());
        assertThat(request.getValue().getExpiresAt()).isEqualTo(baseline.getExpiresAt());
        verify(documents).findLockedByIdAndSchoolId(11L, 7L);
    }

    @Test
    void rejectsEditedBaseline() throws Exception {
        KnowledgeDocument baseline = document("old");
        candidate(baseline, "new content", hash("new content"));
        when(documents.findLockedByIdAndSchoolId(11L, 7L)).thenReturn(document("edited"));
        assertConflict(() -> service.apply(7L, 29L, 3L));
        verify(documentService, never()).revise(any(), any(), any(), any());
    }

    @Test
    void rejectsChangedSourceEvenWhenContentIsUnchanged() throws Exception {
        KnowledgeDocument baseline = document("old");
        candidate(baseline, "new content", hash("new content"));
        KnowledgeDocument edited = document("old");
        edited.setSourceUrl("https://www.tsguas.edu.cn/other.html");
        when(documents.findLockedByIdAndSchoolId(11L, 7L)).thenReturn(edited);
        assertConflict(() -> service.apply(7L, 29L, 3L));
        verify(documentService, never()).revise(any(), any(), any(), any());
    }

    @Test
    void rejectsArchivedBaseline() throws Exception {
        KnowledgeDocument baseline = document("old");
        candidate(baseline, "new content", hash("new content"));
        baseline.setStatus("ARCHIVED");
        assertConflict(() -> service.apply(7L, 29L, 3L));
        verify(documentService, never()).revise(any(), any(), any(), any());
    }

    @Test
    void rejectsCorruptedCandidateContent() throws Exception {
        candidate(document("old"), "unexpected content", hash("new content"));
        assertConflict(() -> service.apply(7L, 29L, 3L));
        verify(documentService, never()).revise(any(), any(), any(), any());
    }

    @Test
    void rejectsMissingBaseline() throws Exception {
        candidate(document("old"), "new content", hash("new content"));
        when(documents.findLockedByIdAndSchoolId(11L, 7L)).thenReturn(null);
        assertConflict(() -> service.apply(7L, 29L, 3L));
        verify(documentService, never()).revise(any(), any(), any(), any());
    }

    @Test
    void failsIfCandidateReviewWasNotRecorded() throws Exception {
        candidate(document("old"), "new content", hash("new content"));
        when(documentService.revise(eq(7L), eq(11L), eq(3L), any()))
                .thenReturn(new KnowledgeImportResponse(42L, 1, false));
        // A thrown runtime conflict makes the real transaction roll back the revision as well.
        assertConflict(() -> service.apply(7L, 29L, 3L));
    }

    private void candidate(KnowledgeDocument baseline, String content, String detectedHash) throws Exception {
        ResultSet result = mock(ResultSet.class);
        when(result.getLong("document_id")).thenReturn(11L);
        when(result.getString("source_url")).thenReturn(baseline.getSourceUrl());
        when(result.getString("detected_title")).thenReturn("官网标题");
        when(result.getString("detected_content")).thenReturn(content);
        when(result.getString("previous_hash")).thenReturn(baseline.getContentHash());
        when(result.getString("detected_hash")).thenReturn(detectedHash);
        doAnswer(invocation -> List.of(((RowMapper<?>) invocation.getArgument(1)).mapRow(result, 0)))
                .when(jdbc).query(anyString(), any(RowMapper.class), eq(29L), eq(7L));
        when(documents.findLockedByIdAndSchoolId(11L, 7L)).thenReturn(baseline);
    }

    private void assertConflict(Runnable action) {
        assertThatThrownBy(action::run).isInstanceOfSatisfying(ResponseStatusException.class,
                exception -> assertThat(exception.getStatusCode()).isEqualTo(HttpStatus.CONFLICT));
    }

    private String hash(String content) throws Exception {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                .digest(content.getBytes(StandardCharsets.UTF_8)));
    }

    private KnowledgeDocument document(String content) throws Exception {
        KnowledgeDocument document = new KnowledgeDocument();
        document.setId(11L);
        document.setSchoolId(7L);
        document.setStatus("PUBLISHED");
        document.setSourceUrl("https://www.tsguas.edu.cn/notice.html");
        document.setContentHash(hash(content));
        return document;
    }
}
