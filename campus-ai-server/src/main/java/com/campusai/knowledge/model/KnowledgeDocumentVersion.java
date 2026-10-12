package com.campusai.knowledge.model;

import lombok.Data;

@Data
public class KnowledgeDocumentVersion {
    private Long documentId;
    private Long rootDocumentId;
    private Integer versionNumber;
    private Long supersedesDocumentId;
}
