package com.campusai.service;

import com.campusai.knowledge.model.KnowledgeSearchResult;

import java.util.List;

public interface KnowledgeSearchService {

    List<KnowledgeSearchResult> search(
            Long schoolId,
            String keyword
    );
}
