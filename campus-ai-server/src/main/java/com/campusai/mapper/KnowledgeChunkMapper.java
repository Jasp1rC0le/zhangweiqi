package com.campusai.mapper;

import com.campusai.knowledge.entity.KnowledgeChunk;
import com.campusai.knowledge.model.KnowledgeSearchResult;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface KnowledgeChunkMapper {

    int insert(KnowledgeChunk chunk);

    List<KnowledgeSearchResult> searchPublished(
            @Param("schoolId") Long schoolId,
            @Param("keyword") String keyword,
            @Param("limit") Integer limit
    );

    List<KnowledgeSearchResult> searchPublishedByTerms(
            @Param("schoolId") Long schoolId,
            @Param("keyword") String keyword,
            @Param("terms") List<String> terms,
            @Param("limit") Integer limit
    );
}
