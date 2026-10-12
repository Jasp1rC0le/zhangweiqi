package com.campusai.knowledge.model;

import lombok.Data;

@Data
public class KnowledgeEvaluationCase {
    private Long id;
    private Long schoolId;
    private String question;
    private Long expectedDocumentId;
}
