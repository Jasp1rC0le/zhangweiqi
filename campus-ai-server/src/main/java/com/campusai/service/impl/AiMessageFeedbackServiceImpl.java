package com.campusai.service.impl;

import com.campusai.dto.AdminMessageFeedbackResponse;
import com.campusai.dto.ResolveMessageFeedbackRequest;
import com.campusai.knowledge.entity.KnowledgeDocument;
import com.campusai.mapper.AiMessageFeedbackMapper;
import com.campusai.mapper.KnowledgeDocumentMapper;
import com.campusai.service.AiMessageFeedbackService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@Service
public class AiMessageFeedbackServiceImpl implements AiMessageFeedbackService {

    private final AiMessageFeedbackMapper feedbackMapper;
    private final KnowledgeDocumentMapper documentMapper;

    public AiMessageFeedbackServiceImpl(AiMessageFeedbackMapper feedbackMapper,
                                        KnowledgeDocumentMapper documentMapper) {
        this.feedbackMapper = feedbackMapper;
        this.documentMapper = documentMapper;
    }

    @Override
    public List<AdminMessageFeedbackResponse> findRecentBySchoolId(Long schoolId) {
        return feedbackMapper.findRecentBySchoolId(schoolId);
    }

    @Override
    @Transactional
    public AdminMessageFeedbackResponse resolve(Long schoolId, Long feedbackId, Long reviewerId,
                                                ResolveMessageFeedbackRequest request) {
        AdminMessageFeedbackResponse feedback = feedbackMapper.findAdminFeedback(schoolId, feedbackId);
        if (feedback == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "反馈不存在");
        }
        if (!Boolean.FALSE.equals(feedback.getHelpful())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "只能处理差评纠错");
        }
        if (request.documentId() != null) {
            KnowledgeDocument document = documentMapper.findByIdAndSchoolId(request.documentId(), schoolId);
            if (document == null || !"PUBLISHED".equals(document.getStatus())) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "请选择本校已发布的修复资料");
            }
        }
        feedbackMapper.resolve(feedbackId, reviewerId, request.documentId(), request.note().trim());
        return feedbackMapper.findAdminFeedback(schoolId, feedbackId);
    }
}
