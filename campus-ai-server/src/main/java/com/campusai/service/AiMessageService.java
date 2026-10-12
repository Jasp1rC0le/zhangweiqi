package com.campusai.service;

import com.campusai.dto.ChatResponse;
import com.campusai.dto.CreateMessageRequest;
import com.campusai.dto.MessageResponse;
import com.campusai.dto.MessageFeedbackRequest;

import java.util.List;
import java.util.function.Consumer;

public interface AiMessageService {

    ChatResponse chat(
            Long userId,
            Long conversationId,
            CreateMessageRequest request
    );

    ChatResponse streamChat(
            Long userId,
            Long conversationId,
            CreateMessageRequest request,
            Consumer<String> onDelta
    );

    List<MessageResponse> findAllByConversationId(
            Long userId,
            Long conversationId
    );

    MessageResponse updateFeedback(
            Long userId,
            Long conversationId,
            Long messageId,
            MessageFeedbackRequest request
    );
}
