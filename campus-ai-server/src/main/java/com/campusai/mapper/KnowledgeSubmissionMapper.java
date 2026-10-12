package com.campusai.mapper;

import com.campusai.knowledge.submission.entity.KnowledgeSubmission;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface KnowledgeSubmissionMapper {

    int insert(KnowledgeSubmission submission);

    KnowledgeSubmission findByIdAndSchoolId(
            @Param("id") Long id,
            @Param("schoolId") Long schoolId
    );

    List<KnowledgeSubmission> findByUserId(
            @Param("userId") Long userId
    );

    List<KnowledgeSubmission> findPendingBySchoolId(
            @Param("schoolId") Long schoolId
    );

    int markApproved(
            @Param("id") Long id,
            @Param("schoolId") Long schoolId,
            @Param("reviewedBy") Long reviewedBy,
            @Param("reviewNote") String reviewNote,
            @Param("knowledgeDocumentId") Long knowledgeDocumentId
    );

    int markRejected(
            @Param("id") Long id,
            @Param("schoolId") Long schoolId,
            @Param("reviewedBy") Long reviewedBy,
            @Param("reviewNote") String reviewNote
    );
}
