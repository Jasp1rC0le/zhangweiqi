package com.campusai.service.impl;

import com.campusai.dto.CreateKnowledgeEvaluationCaseRequest;
import com.campusai.dto.KnowledgeEvaluationReport;
import com.campusai.knowledge.model.KnowledgeEvaluationCase;
import com.campusai.knowledge.model.KnowledgeSearchResult;
import com.campusai.mapper.KnowledgeDocumentMapper;
import com.campusai.mapper.KnowledgeEvaluationMapper;
import com.campusai.service.KnowledgeSearchService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.List;

@Service
public class KnowledgeEvaluationService {
    private final KnowledgeEvaluationMapper cases;
    private final KnowledgeDocumentMapper documents;
    private final KnowledgeSearchService search;

    public KnowledgeEvaluationService(KnowledgeEvaluationMapper cases,
                                      KnowledgeDocumentMapper documents,
                                      KnowledgeSearchService search) {
        this.cases = cases;
        this.documents = documents;
        this.search = search;
    }

    public List<KnowledgeEvaluationCase> list(Long schoolId) {
        return cases.findBySchoolId(schoolId);
    }

    public KnowledgeEvaluationCase add(Long schoolId, CreateKnowledgeEvaluationCaseRequest request) {
        var document = documents.findCurrentEvaluationTarget(request.expectedDocumentId(), schoolId);
        if (document == null || !request.expectedDocumentId().equals(document.getId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "标准资料须是本校当前已生效且未过期的最新发布资料");
        }
        if (cases.findBySchoolId(schoolId).size() >= 30) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "固定评测集最多30题");
        }
        KnowledgeEvaluationCase value = new KnowledgeEvaluationCase();
        value.setSchoolId(schoolId);
        value.setQuestion(request.question().trim());
        value.setExpectedDocumentId(request.expectedDocumentId());
        cases.insert(value);
        return value;
    }

    public void delete(Long schoolId, Long id) {
        if (cases.delete(id, schoolId) != 1) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "评测题不存在");
        }
    }

    public KnowledgeEvaluationReport run(Long schoolId) {
        List<KnowledgeEvaluationCase> fixedCases = cases.findBySchoolId(schoolId);
        if (fixedCases.size() > 30) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "每次最多评测30题");
        }
        List<KnowledgeEvaluationReport.Result> details = new ArrayList<>();
        int hits = 0;
        double reciprocalSum = 0;
        for (KnowledgeEvaluationCase item : fixedCases) {
            var target = documents.findCurrentEvaluationTarget(item.getExpectedDocumentId(), schoolId);
            Long targetId = target == null ? null : target.getId();
            List<KnowledgeSearchResult> found = search.search(schoolId, item.getQuestion());
            int rank = 0;
            for (int i = 0; i < Math.min(5, found.size()); i++) {
                if (targetId != null && targetId.equals(found.get(i).getDocumentId())) {
                    rank = i + 1;
                    break;
                }
            }
            if (rank > 0) {
                hits++;
                reciprocalSum += 1.0 / rank;
            }
            details.add(new KnowledgeEvaluationReport.Result(
                    item.getId(), item.getQuestion(), item.getExpectedDocumentId(), rank, targetId,
                    targetId == null ? "UNAVAILABLE"
                            : targetId.equals(item.getExpectedDocumentId()) ? "CURRENT" : "REVISED"));
        }
        int total = fixedCases.size();
        return new KnowledgeEvaluationReport(total, hits,
                total == 0 ? 0 : (double) hits / total,
                total == 0 ? 0 : reciprocalSum / total,
                details);
    }
}
