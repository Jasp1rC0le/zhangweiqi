package com.campusai.knowledge.semantic;

import com.campusai.knowledge.entity.KnowledgeChunk;
import com.campusai.knowledge.model.KnowledgeSearchResult;
import com.campusai.mapper.KnowledgeEmbeddingMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class KnowledgeSemanticService {
    private static final Logger log = LoggerFactory.getLogger(KnowledgeSemanticService.class);
    private final KnowledgeEmbeddingMapper mapper;
    private final GlmSemanticClient client;
    private final boolean enabled;
    private final boolean rerankEnabled;

    public KnowledgeSemanticService(KnowledgeEmbeddingMapper mapper, GlmSemanticClient client,
                                    @Value("${app.knowledge.semantic-enabled:false}") boolean enabled,
                                    @Value("${app.knowledge.rerank-enabled:false}") boolean rerankEnabled) {
        this.mapper = mapper;
        this.client = client;
        this.enabled = enabled;
        this.rerankEnabled = rerankEnabled;
    }

    public boolean available() { return enabled && client.configured(); }

    public int indexNextBatch(Long schoolId) {
        if (!available()) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                "语义检索未启用或独立的语义检索 Key 缺失");
        List<KnowledgeChunk> missing = mapper.findMissingBySchool(schoolId, client.model(), 10);
        return index(missing);
    }

    public void indexDocument(Long schoolId, Long documentId) {
        if (!available()) return;
        for (int batch = 0; batch < 100; batch++) {
            List<KnowledgeChunk> missing = mapper.findMissingByDocument(
                    schoolId, documentId, client.model(), 10);
            if (missing.isEmpty()) return;
            index(missing);
        }
    }

    private int index(List<KnowledgeChunk> missing) {
        if (missing.isEmpty()) return 0;
        List<List<Double>> vectors = client.embed(missing.stream().map(KnowledgeChunk::getContent).toList());
        for (int i = 0; i < missing.size(); i++) {
            KnowledgeEmbedding entry = new KnowledgeEmbedding();
            entry.setChunkId(missing.get(i).getId());
            entry.setModel(client.model());
            entry.setDimensions(client.dimensions());
            entry.setVectorJson(client.serialize(vectors.get(i)));
            mapper.upsert(entry);
        }
        return missing.size();
    }

    public List<KnowledgeSearchResult> search(Long schoolId, String query) {
        if (!available() || query.length() > 500) return List.of();
        List<KnowledgeEmbedding> stored = mapper.findActiveBySchool(schoolId, client.model(), 2000);
        if (stored.isEmpty()) return List.of();
        try {
            List<Double> queryVector = client.embed(List.of(query)).get(0);
            List<Scored> ranked = new ArrayList<>();
            for (KnowledgeEmbedding entry : stored) {
                if (entry.getDimensions() != queryVector.size()) continue;
                double score = cosine(queryVector, client.deserialize(entry.getVectorJson()));
                if (score >= 0.65) ranked.add(new Scored(entry.getChunkId(), score));
            }
            List<Scored> top = ranked.stream().sorted(Comparator.comparingDouble(Scored::score).reversed())
                    .limit(12).toList();
            if (top.isEmpty()) return List.of();
            Map<Long, Double> scores = new HashMap<>();
            top.forEach(item -> scores.put(item.id(), item.score()));
            List<KnowledgeSearchResult> found = mapper.findActiveChunksByIds(schoolId,
                    top.stream().map(Scored::id).toList());
            found.forEach(item -> item.setScore(scores.getOrDefault(item.getChunkId(), 0.0) * 4));
            return found;
        } catch (RuntimeException exception) {
            log.warn("语义检索失败，回退关键词检索: {}", exception.getClass().getSimpleName());
            return List.of();
        }
    }

    public void rerank(String query, List<KnowledgeSearchResult> candidates) {
        if (!available() || !rerankEnabled || candidates.isEmpty() || query.length() > 4096) return;
        List<KnowledgeSearchResult> selected = candidates.stream()
                .sorted(Comparator.comparingDouble(item -> -safe(item.getScore())))
                .limit(16).toList();
        try {
            Map<Integer, Double> scores = client.rerank(query, selected.stream()
                    .map(item -> (item.getTitle() + "\n" + item.getContent()).substring(0,
                            Math.min(4000, (item.getTitle() + "\n" + item.getContent()).length())))
                    .toList());
            for (int i = 0; i < selected.size(); i++) {
                Double score = scores.get(i);
                if (score != null) selected.get(i).setScore(safe(selected.get(i).getScore()) + score * 8);
            }
        } catch (RuntimeException exception) {
            log.warn("模型重排失败，沿用规则排序: {}", exception.getClass().getSimpleName());
        }
    }

    static double cosine(List<Double> left, List<Double> right) {
        if (left.size() != right.size() || left.isEmpty()) return 0;
        double dot = 0, a = 0, b = 0;
        for (int i = 0; i < left.size(); i++) {
            dot += left.get(i) * right.get(i);
            a += left.get(i) * left.get(i);
            b += right.get(i) * right.get(i);
        }
        return a == 0 || b == 0 ? 0 : dot / Math.sqrt(a * b);
    }

    private double safe(Double value) { return value == null ? 0 : value; }
    private record Scored(Long id, double score) {}
}
