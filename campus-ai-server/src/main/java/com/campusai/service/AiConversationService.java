package com.campusai.service;

import com.campusai.conversation.entity.AiConversation;
import com.campusai.dto.CreateConversationRequest;

import java.util.List;

public interface AiConversationService {

    AiConversation create(
            Long userId,
            CreateConversationRequest request
    );

    List<AiConversation> findAllByUserId(Long userId);

    AiConversation findById(
            Long userId,
            Long conversationId
    );

    boolean deleteById(
            Long userId,
            Long conversationId
    );
}