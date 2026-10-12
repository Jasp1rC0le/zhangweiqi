package com.campusai.service;

import com.campusai.dto.CreateKnowledgeSubmissionRequest;
import com.campusai.dto.KnowledgeSubmissionResponse;
import com.campusai.dto.CreateKnowledgeDocumentRequest;

import java.util.List;

public interface KnowledgeSubmissionService {

    KnowledgeSubmissionResponse submit(
            Long userId,
            CreateKnowledgeSubmissionRequest request
    );

    List<KnowledgeSubmissionResponse> findMine(Long userId);

    List<KnowledgeSubmissionResponse> findPending(Long schoolId);

    KnowledgeSubmissionResponse approve(
            Long reviewerId,
            Long schoolId,
            Long submissionId
    );

    KnowledgeSubmissionResponse mergeIntoDocument(Long reviewerId, Long schoolId,
            Long submissionId, Long documentId, CreateKnowledgeDocumentRequest reviewedDocument);

    KnowledgeSubmissionResponse reject(
            Long reviewerId,
            Long schoolId,
            Long submissionId,
            String reviewNote
    );
}
