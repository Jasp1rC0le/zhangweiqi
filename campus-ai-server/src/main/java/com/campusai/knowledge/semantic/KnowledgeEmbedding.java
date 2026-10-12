package com.campusai.knowledge.semantic;

import lombok.Data;

@Data
public class KnowledgeEmbedding {
    private Long chunkId;
    private String model;
    private Integer dimensions;
    private String vectorJson;
}
