package com.campusai.service;

import com.campusai.dto.CreateKnowledgeEvaluationCaseRequest;
import com.campusai.knowledge.entity.KnowledgeDocument;
import com.campusai.knowledge.model.KnowledgeEvaluationCase;
import com.campusai.knowledge.model.KnowledgeSearchResult;
import com.campusai.mapper.KnowledgeDocumentMapper;
import com.campusai.mapper.KnowledgeEvaluationMapper;
import com.campusai.service.impl.KnowledgeEvaluationService;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class KnowledgeEvaluationServiceTest {
    @Test
    void fixedSetReportsHitAndMissWithoutInventingAnswers() {
        KnowledgeEvaluationMapper cases = mock(KnowledgeEvaluationMapper.class);
        KnowledgeDocumentMapper docs = mock(KnowledgeDocumentMapper.class);
        KnowledgeSearchService search = mock(KnowledgeSearchService.class);
        KnowledgeEvaluationService service = new KnowledgeEvaluationService(cases, docs, search);
        KnowledgeEvaluationCase first = item(1L, "图书馆几点关门", 11L);
        KnowledgeEvaluationCase second = item(2L, "校园卡在哪补办", 12L);
        when(cases.findBySchoolId(3L)).thenReturn(List.of(first, second));
        when(docs.findCurrentEvaluationTarget(11L, 3L)).thenReturn(document(11L));
        when(docs.findCurrentEvaluationTarget(12L, 3L)).thenReturn(document(12L));
        when(search.search(3L, first.getQuestion())).thenReturn(List.of(found(10L), found(11L)));
        when(search.search(3L, second.getQuestion())).thenReturn(List.of(found(20L)));

        var report = service.run(3L);

        assertThat(report.total()).isEqualTo(2);
        assertThat(report.hitsAtFive()).isEqualTo(1);
        assertThat(report.recallAtFive()).isEqualTo(0.5);
        assertThat(report.meanReciprocalRank()).isEqualTo(0.25);
        assertThat(report.cases()).extracting("rank").containsExactly(2, 0);
    }

    @Test
    void rejectsCrossSchoolGoldDocument() {
        KnowledgeEvaluationMapper cases = mock(KnowledgeEvaluationMapper.class);
        KnowledgeDocumentMapper docs = mock(KnowledgeDocumentMapper.class);
        var service = new KnowledgeEvaluationService(cases, docs, mock(KnowledgeSearchService.class));
        assertThatThrownBy(() -> service.add(3L,
                new CreateKnowledgeEvaluationCaseRequest("问题", 99L)))
                .isInstanceOf(ResponseStatusException.class);
        verify(cases, never()).insert(any());
    }

    @Test
    void revisionIsResolvedWithoutChangingOriginalGoldCase() {
        var cases = mock(KnowledgeEvaluationMapper.class);
        var docs = mock(KnowledgeDocumentMapper.class);
        var search = mock(KnowledgeSearchService.class);
        var item = item(27L, "校园卡能让同学代补吗", 54L);
        when(cases.findBySchoolId(3L)).thenReturn(List.of(item));
        when(docs.findCurrentEvaluationTarget(54L, 3L)).thenReturn(document(64L));
        when(search.search(3L, item.getQuestion())).thenReturn(List.of(found(54L), found(64L)));
        var report = new KnowledgeEvaluationService(cases, docs, search).run(3L);
        assertThat(report.hitsAtFive()).isEqualTo(1);
        assertThat(report.cases().get(0).rank()).isEqualTo(2);
        assertThat(report.cases().get(0).expectedDocumentId()).isEqualTo(54L);
        assertThat(report.cases().get(0).evaluatedDocumentId()).isEqualTo(64L);
        assertThat(report.cases().get(0).targetStatus()).isEqualTo("REVISED");
        assertThat(item.getExpectedDocumentId()).isEqualTo(54L);
        verify(cases, never()).insert(any());
        verify(cases, never()).delete(any(), any());
    }

    @Test
    void unavailableTargetRemainsAMissAndInDenominator() {
        var cases = mock(KnowledgeEvaluationMapper.class);
        var docs = mock(KnowledgeDocumentMapper.class);
        var search = mock(KnowledgeSearchService.class);
        when(cases.findBySchoolId(3L)).thenReturn(List.of(item(1L, "失效问题", 54L)));
        when(search.search(3L, "失效问题")).thenReturn(List.of(found(54L)));
        var report = new KnowledgeEvaluationService(cases, docs, search).run(3L);
        assertThat(report.total()).isEqualTo(1);
        assertThat(report.hitsAtFive()).isZero();
        assertThat(report.cases().get(0).targetStatus()).isEqualTo("UNAVAILABLE");
        assertThat(report.cases().get(0).evaluatedDocumentId()).isNull();
    }

    @Test
    void sixthResultDoesNotCountAsRecallAtFive() {
        var cases = mock(KnowledgeEvaluationMapper.class);
        var docs = mock(KnowledgeDocumentMapper.class);
        var search = mock(KnowledgeSearchService.class);
        when(cases.findBySchoolId(3L)).thenReturn(List.of(item(1L, "问题", 6L)));
        when(docs.findCurrentEvaluationTarget(6L, 3L)).thenReturn(document(6L));
        when(search.search(3L, "问题")).thenReturn(List.of(found(1L),found(2L),found(3L),found(4L),found(5L),found(6L)));
        assertThat(new KnowledgeEvaluationService(cases, docs, search).run(3L).hitsAtFive()).isZero();
    }

    @Test
    void newCaseMustSelectCurrentVersionAndLimitStillApplies() {
        var cases = mock(KnowledgeEvaluationMapper.class);
        var docs = mock(KnowledgeDocumentMapper.class);
        var service = new KnowledgeEvaluationService(cases, docs, mock(KnowledgeSearchService.class));
        when(docs.findCurrentEvaluationTarget(54L, 3L)).thenReturn(document(64L));
        assertThatThrownBy(() -> service.add(3L, new CreateKnowledgeEvaluationCaseRequest("问题",54L)))
                .isInstanceOf(ResponseStatusException.class);
        when(docs.findCurrentEvaluationTarget(64L, 3L)).thenReturn(document(64L));
        when(cases.findBySchoolId(3L)).thenReturn(java.util.Collections.nCopies(30,item(1L,"问题",64L)));
        assertThatThrownBy(() -> service.add(3L, new CreateKnowledgeEvaluationCaseRequest("问题",64L)))
                .isInstanceOf(ResponseStatusException.class);
        verify(cases, never()).insert(any());
    }

    private KnowledgeDocument document(Long id) {
        var value = new KnowledgeDocument(); value.setId(id); return value;
    }

    private KnowledgeEvaluationCase item(Long id, String question, Long expected) {
        KnowledgeEvaluationCase value = new KnowledgeEvaluationCase();
        value.setId(id); value.setQuestion(question); value.setExpectedDocumentId(expected);
        return value;
    }

    private KnowledgeSearchResult found(Long documentId) {
        KnowledgeSearchResult value = new KnowledgeSearchResult();
        value.setDocumentId(documentId);
        return value;
    }
}
