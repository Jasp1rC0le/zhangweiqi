package com.campusai.service;

import com.campusai.dto.AdminMessageFeedbackResponse;
import com.campusai.dto.ResolveMessageFeedbackRequest;

import java.util.List;

public interface AiMessageFeedbackService {

    List<AdminMessageFeedbackResponse> findRecentBySchoolId(Long schoolId);

    AdminMessageFeedbackResponse resolve(Long schoolId, Long feedbackId, Long reviewerId,
                                         ResolveMessageFeedbackRequest request);
}
