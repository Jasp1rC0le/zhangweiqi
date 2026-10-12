package com.campusai.service.impl;

import com.campusai.conversation.entity.AiConversation;
import com.campusai.dto.CreateConversationRequest;
import com.campusai.mapper.AiConversationMapper;
import com.campusai.service.AiConversationService;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class AiConversationServiceImpl
        implements AiConversationService {

    private final AiConversationMapper conversationMapper;

    public AiConversationServiceImpl(
            AiConversationMapper conversationMapper) {

        this.conversationMapper = conversationMapper;
    }

    @Override
    public AiConversation create(
            Long userId,
            CreateConversationRequest request) {

        String title = request.getTitle();

        if (title == null || title.isBlank()) {
            title = "新对话";
        } else {
            title = title.trim();
        }

        AiConversation conversation = new AiConversation();
        conversation.setUserId(userId);
        conversation.setTitle(title);
        conversation.setModel("standard");

        int affectedRows = conversationMapper.insert(conversation);

        if (affectedRows != 1) {
            throw new IllegalStateException("AI会话创建失败");
        }

        return conversationMapper.findByIdAndUserId(
                conversation.getId(),
                userId
        );
    }

    @Override
    public List<AiConversation> findAllByUserId(Long userId) {
        return conversationMapper.findAllByUserId(userId);
    }

    @Override
    public AiConversation findById(
            Long userId,
            Long conversationId) {

        return conversationMapper.findByIdAndUserId(
                conversationId,
                userId
        );
    }

    @Override
    public boolean deleteById(
            Long userId,
            Long conversationId) {

        int affectedRows =
                conversationMapper.deleteByIdAndUserId(
                        conversationId,
                        userId
                );

        return affectedRows == 1;
    }
}
