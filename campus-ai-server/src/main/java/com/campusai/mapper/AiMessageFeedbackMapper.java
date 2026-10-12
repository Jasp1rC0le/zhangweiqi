package com.campusai.mapper;

import com.campusai.message.entity.AiMessageFeedback;
import com.campusai.dto.AdminMessageFeedbackResponse;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface AiMessageFeedbackMapper {

    int upsert(AiMessageFeedback feedback);

    AiMessageFeedback findByUserIdAndMessageId(
            @Param("userId") Long userId,
            @Param("messageId") Long messageId
    );

    List<AiMessageFeedback> findAllByUserIdAndConversationId(
            @Param("userId") Long userId,
            @Param("conversationId") Long conversationId
    );

    List<AdminMessageFeedbackResponse> findRecentBySchoolId(
            @Param("schoolId") Long schoolId
    );

    AdminMessageFeedbackResponse findAdminFeedback(
            @Param("schoolId") Long schoolId, @Param("feedbackId") Long feedbackId);

    int resolve(@Param("feedbackId") Long feedbackId, @Param("reviewerId") Long reviewerId,
                @Param("documentId") Long documentId, @Param("note") String note);

    int clearResolution(@Param("userId") Long userId, @Param("messageId") Long messageId);
}
