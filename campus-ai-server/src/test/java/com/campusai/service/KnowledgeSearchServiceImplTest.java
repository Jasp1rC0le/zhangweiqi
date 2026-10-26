package com.campusai.service;

import com.campusai.knowledge.model.KnowledgeSearchResult;
import com.campusai.knowledge.semantic.KnowledgeSemanticService;
import com.campusai.mapper.KnowledgeChunkMapper;
import com.campusai.service.impl.KnowledgeSearchServiceImpl;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;

import java.time.LocalDateTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import org.mockito.ArgumentCaptor;

@Timeout(10)
class KnowledgeSearchServiceImplTest {

    @Test
    void shouldPrioritizeTopicsAfterAnIntroductoryYearInLongQuestions() {
        List<String> terms = capturedTerms("我是2023级学生，也要参加实验室安全线上学习和准入考核吗？"
                + "9月21日是不是所有学生考试截止日？实验指导书应有哪些安全内容？");
        assertTrue(terms.containsAll(List.of("实验室", "安全", "准入", "考核", "指导书")));
        assertTrue(terms.size() <= 16);
        assertEquals(terms.size(), terms.stream().distinct().count());
    }

    @Test
    void shouldKeepBothVenuesInAMixedQuestion() {
        List<String> terms = capturedTerms("图书馆座位什么时候能预约？暂离35分钟回来怎么办？"
                + "这套时间能用于体育馆抢场吗？");
        assertTrue(terms.containsAll(List.of("图书馆", "体育馆", "借阅")));
        assertTrue(terms.size() <= 16);
    }

    @Test
    void shouldKeepLaterClausesForTopicsOutsideTheLexicon() {
        List<String> terms = capturedTerms("最近事情很多忙着整理笔记还有很多事情想了解一下，请问拐杖可以借用吗？");
        assertTrue(terms.contains("拐杖"));
        assertTrue(terms.size() <= 16);
    }

    @Test
    void shouldRankSafetyTopicAboveAMatchingYearInUnrelatedCourseRules() {
        KnowledgeChunkMapper mapper = mock(KnowledgeChunkMapper.class);
        KnowledgeSearchServiceImpl service = new KnowledgeSearchServiceImpl(mapper);
        String query = "我是2023级学生 实验室安全线上学习和准入考核怎么安排 指导书要有哪些安全内容";
        KnowledgeSearchResult unrelated = result(1L, 132L, "2023课程考试规范",
                "2023级学生考试截止日与成绩复核", 20.0);
        KnowledgeSearchResult safety = result(2L, 142L, "实验室安全线上学习 准入考核与指导书",
                "2023至2026级学生应按学院安排完成实验室安全学习和准入考核", 1.0);
        when(mapper.searchPublished(eq(1L), eq(query), eq(24))).thenReturn(List.of(unrelated));
        when(mapper.searchPublishedByTerms(eq(1L), eq(query), anyList(), eq(24)))
                .thenReturn(List.of(unrelated, safety));
        assertEquals(142L, service.search(1L, query).get(0).getDocumentId());
    }

    private List<String> capturedTerms(String query) {
        KnowledgeChunkMapper mapper = mock(KnowledgeChunkMapper.class);
        var service = new KnowledgeSearchServiceImpl(mapper);
        service.search(7L, query);
        ArgumentCaptor<List<String>> terms = ArgumentCaptor.forClass(List.class);
        verify(mapper).searchPublishedByTerms(eq(7L), org.mockito.ArgumentMatchers.anyString(), terms.capture(), eq(24));
        return terms.getValue();
    }

    @Test
    void combinesSemanticOnlyCandidateWithKeywordCandidates() {
        KnowledgeChunkMapper mapper = mock(KnowledgeChunkMapper.class);
        KnowledgeSemanticService semantic = mock(KnowledgeSemanticService.class);
        KnowledgeSearchServiceImpl service = new KnowledgeSearchServiceImpl(mapper, semantic);
        KnowledgeSearchResult semanticOnly = result(9L, 90L, "借书时段", "图书馆借阅安排", 2.5);
        when(mapper.searchPublished(eq(1L), eq("图书馆几点关门"), eq(24)))
                .thenReturn(List.of());
        when(mapper.searchPublishedByTerms(eq(1L), eq("图书馆几点关门"), anyList(), eq(24)))
                .thenReturn(List.of());
        when(semantic.search(1L, "图书馆几点关门")).thenReturn(List.of(semanticOnly));

        assertEquals(90L, service.search(1L, "图书馆几点关门").get(0).getDocumentId());
        verify(semantic).rerank(eq("图书馆几点关门"), org.mockito.ArgumentMatchers.anyList());
    }

    @Test
    void shouldMergeFallbackCandidatesAndPreferExactTitleMatch() {
        KnowledgeChunkMapper mapper = mock(KnowledgeChunkMapper.class);
        KnowledgeSearchServiceImpl service = new KnowledgeSearchServiceImpl(mapper);

        KnowledgeSearchResult broadFullText = result(
                1L,
                1L,
                "校园场馆说明",
                "图书馆为校内学习场馆",
                8.0
        );
        KnowledgeSearchResult exactFallback = result(
                2L,
                2L,
                "图书馆工作日开放时间",
                "工作日开放至二十二点",
                3.0
        );

        when(mapper.searchPublished(eq(1L), eq("图书馆工作日几点关门"), eq(24)))
                .thenReturn(List.of(broadFullText));
        when(mapper.searchPublishedByTerms(
                eq(1L),
                eq("图书馆工作日几点关门"),
                anyList(),
                eq(24)
        )).thenReturn(List.of(exactFallback, broadFullText));

        List<KnowledgeSearchResult> results =
                service.search(1L, "图书馆工作日几点关门？");

        assertEquals(2, results.size());
        assertEquals(2L, results.get(0).getChunkId());
        assertTrue(results.get(0).getScore() > results.get(1).getScore());
    }

    @Test
    void shouldLimitRepeatedChunksFromTheSameDocument() {
        KnowledgeChunkMapper mapper = mock(KnowledgeChunkMapper.class);
        KnowledgeSearchServiceImpl service = new KnowledgeSearchServiceImpl(mapper);

        List<KnowledgeSearchResult> candidates = List.of(
                result(1L, 10L, "校园卡补办", "校园卡补办地点一", 10.0),
                result(2L, 10L, "校园卡补办", "校园卡补办地点二", 9.0),
                result(3L, 10L, "校园卡补办", "校园卡补办地点三", 8.0),
                result(4L, 11L, "校园卡充值", "校园卡充值说明", 7.0)
        );

        when(mapper.searchPublished(eq(1L), eq("校园卡补办"), eq(24)))
                .thenReturn(candidates);
        when(mapper.searchPublishedByTerms(eq(1L), eq("校园卡补办"), anyList(), eq(24)))
                .thenReturn(List.of());

        List<KnowledgeSearchResult> results = service.search(1L, "校园卡补办");

        assertEquals(3, results.size());
        assertEquals(2, results.stream().filter(item -> item.getDocumentId() == 10L).count());
    }

    @Test
    void shouldSkipDatabaseForBlankQuery() {
        KnowledgeChunkMapper mapper = mock(KnowledgeChunkMapper.class);
        KnowledgeSearchServiceImpl service = new KnowledgeSearchServiceImpl(mapper);

        assertTrue(service.search(1L, "  ").isEmpty());
        verify(mapper, never()).searchPublished(eq(1L), eq(""), eq(24));
        verify(mapper, never()).searchPublishedByTerms(eq(1L), eq(""), anyList(), eq(24));
    }

    @Test
    void expandsCommonCampusSynonyms() {
        KnowledgeChunkMapper mapper = mock(KnowledgeChunkMapper.class);
        KnowledgeSearchServiceImpl service = new KnowledgeSearchServiceImpl(mapper);
        when(mapper.searchPublished(eq(1L), eq("学校附近饭店"), eq(24))).thenReturn(List.of());
        when(mapper.searchPublishedByTerms(eq(1L), eq("学校附近饭店"), anyList(), eq(24)))
                .thenReturn(List.of());

        service.search(1L, "学校附近饭店");

        ArgumentCaptor<List<String>> terms = ArgumentCaptor.forClass(List.class);
        verify(mapper).searchPublishedByTerms(eq(1L), eq("学校附近饭店"), terms.capture(), eq(24));
        assertTrue(terms.getValue().contains("食堂"));
        assertTrue(terms.getValue().contains("餐厅"));
    }

    private KnowledgeSearchResult result(
            Long chunkId,
            Long documentId,
            String title,
            String content,
            Double score) {

        KnowledgeSearchResult result = new KnowledgeSearchResult();
        result.setChunkId(chunkId);
        result.setDocumentId(documentId);
        result.setTitle(title);
        result.setCategory("校园生活");
        result.setSourceDepartment("图书馆");
        result.setSourceUrl("https://example.edu.cn/source");
        result.setPublishedAt(LocalDateTime.now().minusDays(10));
        result.setContent(content);
        result.setScore(score);
        return result;
    }
}
