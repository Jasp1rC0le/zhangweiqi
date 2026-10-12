package com.campusai.mapper;

import com.campusai.knowledge.model.KnowledgeEvaluationCase;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface KnowledgeEvaluationMapper {
    int insert(KnowledgeEvaluationCase value);
    List<KnowledgeEvaluationCase> findBySchoolId(@Param("schoolId") Long schoolId);
    int delete(@Param("id") Long id, @Param("schoolId") Long schoolId);
}
