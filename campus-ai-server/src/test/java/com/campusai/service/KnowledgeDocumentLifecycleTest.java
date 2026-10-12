package com.campusai.service;

import com.campusai.knowledge.entity.KnowledgeDocument;
import com.campusai.dto.CreateKnowledgeDocumentRequest;
import com.campusai.mapper.KnowledgeChunkMapper;
import com.campusai.mapper.KnowledgeDocumentEventMapper;
import com.campusai.mapper.KnowledgeDocumentMapper;
import com.campusai.mapper.KnowledgeDocumentVersionMapper;
import com.campusai.service.impl.KnowledgeDocumentServiceImpl;
import org.springframework.context.ApplicationEventPublisher;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

class KnowledgeDocumentLifecycleTest {
    @Test
    void rejectsEffectivePeriodWithExpiryBeforeStart() {
        KnowledgeDocumentMapper documents = mock(KnowledgeDocumentMapper.class);
        var service = new KnowledgeDocumentServiceImpl(documents,
                mock(KnowledgeChunkMapper.class), mock(KnowledgeDocumentEventMapper.class),
                mock(KnowledgeDocumentVersionMapper.class), mock(ApplicationEventPublisher.class));
        CreateKnowledgeDocumentRequest request = new CreateKnowledgeDocumentRequest();
        request.setSchoolId(1L);
        request.setTitle("食堂营业时间");
        request.setCategory("校园事务");
        request.setContent("营业时间内容");
        request.setEffectiveAt(java.time.LocalDateTime.of(2026, 9, 21, 9, 0));
        request.setExpiresAt(java.time.LocalDateTime.of(2026, 9, 20, 9, 0));

        assertThatThrownBy(() -> service.importDocument(request))
                .hasMessageContaining("失效时间必须晚于生效时间");
        verifyNoInteractions(documents);
    }

    @Test
    void sameSourceWithChangedBodyRequiresExplicitRevision() {
        KnowledgeDocumentMapper documents = mock(KnowledgeDocumentMapper.class);
        KnowledgeDocument existing = new KnowledgeDocument();
        existing.setId(12L);
        existing.setStatus("PUBLISHED");
        when(documents.findPotentialConflicts(1L, "图书馆通知",
                "https://www.tsguas.edu.cn/library.htm")).thenReturn(java.util.List.of(existing));
        var service = new KnowledgeDocumentServiceImpl(documents,
                mock(KnowledgeChunkMapper.class), mock(KnowledgeDocumentEventMapper.class),
                mock(KnowledgeDocumentVersionMapper.class), mock(ApplicationEventPublisher.class));
        CreateKnowledgeDocumentRequest request = new CreateKnowledgeDocumentRequest();
        request.setSchoolId(1L);
        request.setTitle("图书馆通知");
        request.setCategory("校园事务");
        request.setSourceUrl("https://www.tsguas.edu.cn/library.htm");
        request.setContent("新版通知内容");

        assertThatThrownBy(() -> service.importDocument(request))
                .hasMessageContaining("资料 #12");
        verify(documents, never()).insert(any());
    }

    @Test
    void batchRejectsOtherSchoolBeforeInsertingAnything() {
        KnowledgeDocumentMapper documents = mock(KnowledgeDocumentMapper.class);
        var service = new KnowledgeDocumentServiceImpl(documents,
                mock(KnowledgeChunkMapper.class), mock(KnowledgeDocumentEventMapper.class),
                mock(KnowledgeDocumentVersionMapper.class), mock(ApplicationEventPublisher.class));
        CreateKnowledgeDocumentRequest own = new CreateKnowledgeDocumentRequest();
        own.setSchoolId(1L);
        CreateKnowledgeDocumentRequest foreign = new CreateKnowledgeDocumentRequest();
        foreign.setSchoolId(2L);
        assertThatThrownBy(() -> service.importBatch(1L, java.util.List.of(own, foreign)))
                .hasMessageContaining("本校");
        verifyNoInteractions(documents);
    }

    @Test
    void retiringDocumentWritesAuditAndKeepsItsRecord() {
        KnowledgeDocumentMapper documents = mock(KnowledgeDocumentMapper.class);
        KnowledgeDocumentEventMapper events = mock(KnowledgeDocumentEventMapper.class);
        KnowledgeDocumentVersionMapper versions = mock(KnowledgeDocumentVersionMapper.class);
        KnowledgeDocument before = new KnowledgeDocument();
        before.setId(5L); before.setSchoolId(1L); before.setStatus("PUBLISHED");
        KnowledgeDocument after = new KnowledgeDocument();
        after.setId(5L); after.setSchoolId(1L); after.setStatus("ARCHIVED");
        when(documents.findByIdAndSchoolId(5L, 1L)).thenReturn(before, after);
        when(documents.updateStatus(5L, 1L, "PUBLISHED", "ARCHIVED")).thenReturn(1);
        var service = new KnowledgeDocumentServiceImpl(documents,
                mock(KnowledgeChunkMapper.class), events, versions,
                mock(ApplicationEventPublisher.class));

        assertThat(service.setPublished(1L, 5L, 9L, false, "通知过期").getStatus())
                .isEqualTo("ARCHIVED");
        verify(events).insert(5L, 9L, "PUBLISHED", "ARCHIVED", "通知过期");
        verify(documents, never()).insert(any());
    }
}
