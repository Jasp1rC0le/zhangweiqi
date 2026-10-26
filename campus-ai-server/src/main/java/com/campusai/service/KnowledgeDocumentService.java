package com.campusai.service;

import com.campusai.dto.CreateKnowledgeDocumentRequest;
import com.campusai.dto.KnowledgeImportResponse;
import com.campusai.knowledge.entity.KnowledgeDocument;
import java.util.List;

public interface KnowledgeDocumentService {

    KnowledgeImportResponse importDocument(
            CreateKnowledgeDocumentRequest request
    );

    List<KnowledgeImportResponse> importBatch(Long schoolId, List<CreateKnowledgeDocumentRequest> requests);

    List<KnowledgeDocument> findRecent(Long schoolId);

    List<KnowledgeDocument> scan(Long schoolId, Long beforeId);

    record DocumentOption(Long id,String title,String category) {}
    record DocumentPage(List<DocumentOption> items,int page,int size,int total,int totalPages,String search) {}
    DocumentPage editablePage(Long schoolId,int page,int size,String search);

    KnowledgeDocument setPublished(Long schoolId, Long documentId, Long actorId,
                                   boolean published, String note);

    KnowledgeDocument findOne(Long schoolId, Long documentId);

    List<KnowledgeDocument> findVersions(Long schoolId, Long documentId);

    KnowledgeImportResponse revise(Long schoolId, Long documentId, Long actorId,
                                   CreateKnowledgeDocumentRequest request);

    List<KnowledgeImportResponse> reviseBatch(Long schoolId, Long actorId,
                                              List<RevisionInput> revisions);

    record RevisionInput(Long documentId, CreateKnowledgeDocumentRequest document) {}
}
