package com.campusai.service.impl;

import com.campusai.knowledge.model.KnowledgeSearchResult;
import com.campusai.knowledge.semantic.KnowledgeSemanticService;
import com.campusai.mapper.KnowledgeChunkMapper;
import com.campusai.service.KnowledgeSearchService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;

@Service
public class KnowledgeSearchServiceImpl
        implements KnowledgeSearchService {

    private static final int SEARCH_LIMIT = 5;
    private static final int CANDIDATE_LIMIT = 24;
    private static final int MAX_CHUNKS_PER_DOCUMENT = 2;
    private static final int MAX_QUERY_TERMS = 16;
    private static final double RRF_K = 60.0;
    private static final Map<String, List<String>> CAMPUS_SYNONYMS = Map.of(
            "食堂", List.of("餐厅", "饭店"),
            "饭店", List.of("食堂", "餐厅"),
            "宿舍", List.of("公寓", "寝室"),
            "图书馆", List.of("借阅", "图书"),
            "校园卡", List.of("一卡通"),
            "招聘", List.of("校招", "岗位", "实习"),
            "快递", List.of("驿站")
    );
    private static final Pattern QUERY_SEPARATOR =
            Pattern.compile("[^\\p{IsHan}\\p{L}\\p{N}]+");
    private static final Pattern HAN_PAIR = Pattern.compile("[\\p{IsHan}]{2}");
    private static final List<String> CAMPUS_TOPICS = List.of(
            "图书馆", "体育馆", "校园卡", "一卡通", "学生证", "在读证明",
            "四六级", "准考证", "学籍", "休学", "复学", "退学", "转专业",
            "毕业证明书", "成绩复核", "实验室", "实训", "准入", "考核",
            "实验报告", "指导书", "安全", "设备保养", "仪器", "文献",
            "查收查引", "查新", "查重", "定题", "学科馆员", "馆际互借",
            "奖学金", "助学金", "勤工助学", "宿舍", "公寓", "食堂", "饭店",
            "快递", "驿站", "选课", "课表", "补选", "报销", "票据", "发票",
            "档案", "盖章", "印章", "户籍", "户口", "医保", "招聘", "实习",
            "招生", "录取", "学位", "论文", "答辩"
    );

    private final KnowledgeChunkMapper chunkMapper;
    private final KnowledgeSemanticService semanticService;

    @Autowired
    public KnowledgeSearchServiceImpl(
            KnowledgeChunkMapper chunkMapper,
            KnowledgeSemanticService semanticService) {

        this.chunkMapper = chunkMapper;
        this.semanticService = semanticService;
    }

    // Keep a small constructor for deterministic retrieval unit tests.
    public KnowledgeSearchServiceImpl(KnowledgeChunkMapper chunkMapper) {
        this(chunkMapper, null);
    }

    @Override
    public List<KnowledgeSearchResult> search(
            Long schoolId,
            String keyword) {

        if (schoolId == null || keyword == null || keyword.isBlank()) {
            return List.of();
        }

        String normalizedKeyword = normalize(keyword);
        if (normalizedKeyword.isBlank()) {
            return List.of();
        }

        List<String> terms = buildTerms(normalizedKeyword);
        Map<Long, KnowledgeSearchResult> candidates = new LinkedHashMap<>();
        Map<Long, Double> fusionScores = new LinkedHashMap<>();

        mergeRankedCandidates(
                candidates,
                fusionScores,
                chunkMapper.searchPublished(
                        schoolId,
                        normalizedKeyword,
                        CANDIDATE_LIMIT
                ),
                1.25
        );
        mergeRankedCandidates(
                candidates,
                fusionScores,
                chunkMapper.searchPublishedByTerms(
                        schoolId,
                        normalizedKeyword,
                        terms,
                        CANDIDATE_LIMIT
                ),
                1.0
        );
        List<KnowledgeSearchResult> semanticCandidates = semanticService == null
                ? List.of() : semanticService.search(schoolId, normalizedKeyword);
        mergeRankedCandidates(candidates, fusionScores, semanticCandidates, 1.15);

        List<KnowledgeSearchResult> ranked = new ArrayList<>(candidates.values());
        ranked.forEach(result -> result.setScore(rerank(result, normalizedKeyword, terms)
                + fusionScores.getOrDefault(result.getChunkId(), 0.0) * 100));
        if (semanticService != null) semanticService.rerank(normalizedKeyword, ranked);
        ranked.sort(
                Comparator.comparing(
                                KnowledgeSearchResult::getScore,
                                Comparator.nullsLast(Comparator.reverseOrder())
                        )
                        .thenComparing(
                                KnowledgeSearchResult::getPublishedAt,
                                Comparator.nullsLast(Comparator.reverseOrder())
                        )
                        .thenComparing(
                                KnowledgeSearchResult::getChunkId,
                                Comparator.nullsLast(Comparator.naturalOrder())
                        )
        );

        return diversify(ranked);
    }

    private void mergeRankedCandidates(
            Map<Long, KnowledgeSearchResult> candidates,
            Map<Long, Double> fusionScores,
            List<KnowledgeSearchResult> incoming,
            double weight) {

        if (incoming == null) {
            return;
        }

        for (int rank = 0; rank < incoming.size(); rank++) {
            KnowledgeSearchResult result = incoming.get(rank);
            if (result == null || result.getChunkId() == null) {
                continue;
            }

            fusionScores.merge(result.getChunkId(), weight / (RRF_K + rank + 1), Double::sum);

            candidates.merge(
                    result.getChunkId(),
                    result,
                    (current, candidate) -> {
                        double currentScore = safeScore(current.getScore());
                        double candidateScore = safeScore(candidate.getScore());
                        current.setScore(Math.max(currentScore, candidateScore));
                        return current;
                    }
            );
        }
    }

    private List<KnowledgeSearchResult> diversify(
            List<KnowledgeSearchResult> ranked) {

        Map<Long, Integer> documentCounts = new LinkedHashMap<>();
        List<KnowledgeSearchResult> selected = new ArrayList<>(SEARCH_LIMIT);

        for (KnowledgeSearchResult result : ranked) {
            int currentCount = documentCounts.getOrDefault(result.getDocumentId(), 0);
            if (currentCount >= MAX_CHUNKS_PER_DOCUMENT) {
                continue;
            }

            selected.add(result);
            documentCounts.put(result.getDocumentId(), currentCount + 1);
            if (selected.size() == SEARCH_LIMIT) {
                break;
            }
        }

        return selected;
    }

    private double rerank(
            KnowledgeSearchResult result,
            String normalizedKeyword,
            List<String> terms) {

        String title = normalize(result.getTitle());
        String category = normalize(result.getCategory());
        String department = normalize(result.getSourceDepartment());
        String content = normalize(result.getContent());
        String allText = String.join(" ", title, category, department, content);

        long matchedTerms = terms.stream()
                .filter(allText::contains)
                .count();
        double coverage = terms.isEmpty() ? 0 : (double) matchedTerms / terms.size();
        double score = Math.log1p(Math.max(0, safeScore(result.getScore())));

        if (title.contains(normalizedKeyword)) {
            score += 4.5;
        }
        if (content.contains(normalizedKeyword)) {
            score += 3.0;
        }

        score += coverage * 3.5;
        score += terms.stream().filter(title::contains).count() * 0.7;
        score += terms.stream().filter(category::contains).count() * 0.35;
        score += terms.stream().filter(department::contains).count() * 0.2;
        score += recencyBoost(result.getPublishedAt());

        if (result.getSourceUrl() != null && !result.getSourceUrl().isBlank()) {
            score += 0.15;
            String source = result.getSourceUrl().toLowerCase(Locale.ROOT);
            if (source.contains("tsguas.edu.cn")) score += 0.55;
            else if (source.contains(".gov.cn")) score += 0.4;
        }

        return score;
    }

    private double recencyBoost(LocalDateTime publishedAt) {
        if (publishedAt == null) {
            return 0;
        }

        long ageDays = Math.max(0, ChronoUnit.DAYS.between(publishedAt, LocalDateTime.now()));
        return Math.max(0, 0.75 - Math.min(ageDays, 730) / 730.0 * 0.75);
    }

    private List<String> buildTerms(String keyword) {
        LinkedHashMap<String, Boolean> terms = new LinkedHashMap<>();
        // Identify topics across the whole question before an introductory clause consumes the budget.
        CAMPUS_TOPICS.stream().filter(keyword::contains)
                .sorted(Comparator.comparingInt(keyword::indexOf))
                .limit(MAX_QUERY_TERMS)
                .forEach(topic -> terms.put(topic, Boolean.TRUE));
        CAMPUS_SYNONYMS.entrySet().stream().sorted(Map.Entry.comparingByKey())
                .filter(entry -> keyword.contains(entry.getKey()))
                .flatMap(entry -> entry.getValue().stream())
                .forEach(synonym -> {
                    if (terms.size() < MAX_QUERY_TERMS) terms.put(synonym, Boolean.TRUE);
                });

        List<String> tokens = List.of(keyword.split(" ")).stream()
                .filter(token -> token.length() >= 2).toList();
        for (String token : tokens) {
            if (token.length() <= 32 && terms.size() < MAX_QUERY_TERMS) {
                terms.put(token, Boolean.TRUE);
            }
        }
        // Round-robin fallback preserves later clauses even when their topic is not in the small lexicon.
        int maxLength = tokens.stream().mapToInt(String::length).max().orElse(0);
        for (int index = 0; index < maxLength - 1 && terms.size() < MAX_QUERY_TERMS; index++) {
            for (String token : tokens) {
                if (index + 2 > token.length()) continue;
                String pair = token.substring(index, index + 2);
                if (HAN_PAIR.matcher(pair).matches()) terms.put(pair, Boolean.TRUE);
                if (terms.size() >= MAX_QUERY_TERMS) break;
            }
        }

        if (terms.isEmpty()) {
            terms.put(keyword, Boolean.TRUE);
        }

        return terms.keySet().stream()
                .limit(MAX_QUERY_TERMS)
                .toList();
    }

    private String normalize(String value) {
        if (value == null) {
            return "";
        }

        return QUERY_SEPARATOR
                .matcher(value.toLowerCase(Locale.ROOT).trim())
                .replaceAll(" ")
                .trim()
                .replaceAll("\\s+", " ");
    }

    private double safeScore(Double score) {
        return score == null || !Double.isFinite(score) ? 0 : score;
    }
}
