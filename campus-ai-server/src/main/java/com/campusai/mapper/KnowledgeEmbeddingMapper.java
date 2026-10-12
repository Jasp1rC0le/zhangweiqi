package com.campusai.mapper;

import com.campusai.knowledge.entity.KnowledgeChunk;
import com.campusai.knowledge.semantic.KnowledgeEmbedding;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface KnowledgeEmbeddingMapper {
    List<KnowledgeEmbedding> findActiveBySchool(@Param("schoolId") Long schoolId,
                                                @Param("model") String model,
                                                @Param("limit") int limit);
    List<KnowledgeChunk> findMissingBySchool(@Param("schoolId") Long schoolId,
                                             @Param("model") String model,
                                             @Param("limit") int limit);
    List<KnowledgeChunk> findMissingByDocument(@Param("schoolId") Long schoolId,
                                               @Param("documentId") Long documentId,
                                               @Param("model") String model,
                                               @Param("limit") int limit);
    List<com.campusai.knowledge.model.KnowledgeSearchResult> findActiveChunksByIds(
            @Param("schoolId") Long schoolId, @Param("ids") List<Long> ids);
    int upsert(KnowledgeEmbedding value);
}
