package com.campusai.service;

import com.campusai.dto.CreateKnowledgeDocumentRequest;
import com.campusai.knowledge.entity.KnowledgeDocument;
import com.campusai.mapper.*;
import com.campusai.service.impl.KnowledgeDocumentServiceImpl;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.util.HexFormat;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class KnowledgeDateCorrectionTest {
    final KnowledgeDocumentMapper documents = mock(KnowledgeDocumentMapper.class);
    final KnowledgeChunkMapper chunks = mock(KnowledgeChunkMapper.class);
    final KnowledgeDocumentEventMapper audit = mock(KnowledgeDocumentEventMapper.class);
    final KnowledgeDocumentVersionMapper versions = mock(KnowledgeDocumentVersionMapper.class);
    final ApplicationEventPublisher events = mock(ApplicationEventPublisher.class);
    final KnowledgeDocumentServiceImpl service = new KnowledgeDocumentServiceImpl(documents, chunks, audit, versions, events);

    CreateKnowledgeDocumentRequest request() throws Exception {
        var previous = new KnowledgeDocument();
        previous.setId(93L); previous.setSchoolId(1L); previous.setStatus("PUBLISHED");
        previous.setTitle("中德检索"); previous.setCategory("图书馆"); previous.setRawContent("校园网内首次注册");
        previous.setContentHash(HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                .digest(previous.getRawContent().getBytes(StandardCharsets.UTF_8))));
        when(documents.findByIdAndSchoolId(93L, 1L)).thenReturn(previous);
        when(documents.updateDates(any(), any())).thenReturn(1);
        when(audit.insert(eq(93L), eq(9L), eq("PUBLISHED"), eq("PUBLISHED"), anyString())).thenReturn(1);
        var request = new CreateKnowledgeDocumentRequest();
        request.setSchoolId(1L); request.setTitle(previous.getTitle()); request.setCategory(previous.getCategory());
        request.setContent(previous.getRawContent()); request.setPublishedAt(LocalDateTime.of(2025,10,13,0,0));
        return request;
    }

    @Test void updatesDatesInPlaceWithAuditAndNoDuplicateBody() throws Exception {
        var result = service.revise(1L, 93L, 9L, request());
        assertThat(result.documentId()).isEqualTo(93L);
        assertThat(result.metadataUpdated()).isTrue();
        assertThat(result.duplicate()).isFalse();
        verify(audit).insert(eq(93L), eq(9L), eq("PUBLISHED"), eq("PUBLISHED"), contains("2025-10-13T00:00"));
        verify(documents, never()).insert(any());
        verify(documents, never()).updateStatus(any(), any(), any(), any());
        verifyNoInteractions(chunks);
        verify(versions, never()).insert(any());
        verify(events).publishEvent(any(Object.class));
    }

    @Test void unchangedRequestIsANoOp() throws Exception {
        var request = request(); request.setPublishedAt(null);
        assertThat(service.revise(1L,93L,9L,request).duplicate()).isTrue();
        verify(documents, never()).updateDates(any(),any());
        verifyNoInteractions(audit, chunks, events);
    }

    @Test void rejectsStaleDatesBeforeWritingAudit() throws Exception {
        var request = request(); when(documents.updateDates(any(),any())).thenReturn(0);
        assertThatThrownBy(() -> service.revise(1L,93L,9L,request)).hasMessageContaining("重新读取");
        verifyNoInteractions(audit, chunks, events);
    }

    @Test void rejectsInvalidEffectivePeriod() throws Exception {
        var request = request(); request.setEffectiveAt(LocalDateTime.of(2026,10,12,0,0));
        request.setExpiresAt(LocalDateTime.of(2026,10,10,0,0));
        assertThatThrownBy(() -> service.revise(1L,93L,9L,request)).hasMessageContaining("失效时间必须晚于生效时间");
        verify(documents,never()).updateDates(any(),any());
    }

    @Test void requiresAuditSuccess() throws Exception {
        var request = request(); when(audit.insert(any(),any(),any(),any(),any())).thenReturn(0);
        assertThatThrownBy(() -> service.revise(1L,93L,9L,request)).hasMessageContaining("审计保存失败");
        verifyNoInteractions(events);
    }

    @Test void rejectsForeignSchool() throws Exception {
        var request = request(); request.setSchoolId(2L);
        assertThatThrownBy(() -> service.revise(1L,93L,9L,request)).hasMessageContaining("本校");
        verify(documents,never()).updateDates(any(),any());
    }

    @Test void cannotCorrectSupersededVersion() throws Exception {
        var request = request(); when(versions.countSuccessors(93L)).thenReturn(1);
        assertThatThrownBy(() -> service.revise(1L,93L,9L,request)).hasMessageContaining("最新版本");
        verify(documents,never()).updateDates(any(),any());
    }

    @Test void chatPreviewLocksExactDocumentAndRejectsAChangedMetadataTokenBeforeMutation()throws Exception {
        var input=request();var original=documents.findByIdAndSchoolId(93L,1L);original.setVersionNumber(1);original.setHasSuccessor(false);
        input.setExpectedRevisionTag(original.getRevisionTag());when(documents.findLockedByIdAndSchoolId(93L,1L)).thenReturn(original);
        original.setSourceUrl("https://example.invalid/new-source");
        assertThatThrownBy(()->service.revise(1L,93L,9L,input)).hasMessageContaining("预览后更新");
        verify(documents).findLockedByIdAndSchoolId(93L,1L);verify(documents,never()).updateDates(any(),any());verify(documents,never()).updateStatus(any(),any(),any(),any());verifyNoInteractions(audit,chunks,events);
    }
    @Test void matchingChatPreviewUsesExistingAuditAndMissingLockedTargetFailsClosed()throws Exception {
        var input=request();var original=documents.findByIdAndSchoolId(93L,1L);original.setVersionNumber(1);original.setHasSuccessor(false);input.setExpectedRevisionTag(original.getRevisionTag());
        assertThatThrownBy(()->service.revise(1L,93L,9L,input)).hasMessageContaining("不存在");verifyNoInteractions(audit,chunks,events);
        when(documents.findLockedByIdAndSchoolId(93L,1L)).thenReturn(original);
        assertThat(service.revise(1L,93L,9L,input).metadataUpdated()).isTrue();verify(audit).insert(eq(93L),eq(9L),eq("PUBLISHED"),eq("PUBLISHED"),contains("日期更正"));
    }
}
