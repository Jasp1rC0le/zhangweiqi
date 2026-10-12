package com.campusai.service;

import com.campusai.ai.client.AiModelClient;
import com.campusai.conversation.entity.AiConversation;
import com.campusai.dto.MessageFeedbackRequest;
import com.campusai.dto.MessageResponse;
import com.campusai.mapper.AiConversationMapper;
import com.campusai.mapper.AiMessageCitationMapper;
import com.campusai.mapper.AiMessageFeedbackMapper;
import com.campusai.mapper.AiMessageMapper;
import com.campusai.mapper.UserMapper;
import com.campusai.message.entity.AiMessage;
import com.campusai.message.entity.AiMessageFeedback;
import com.campusai.service.impl.AiMessageServiceImpl;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AiMessageFeedbackServiceImplTest {

    @Test
    void shouldSaveTrimmedFeedbackForOwnedAssistantMessage() {
        AiConversationMapper conversationMapper = mock(AiConversationMapper.class);
        AiMessageMapper messageMapper = mock(AiMessageMapper.class);
        AiMessageCitationMapper citationMapper = mock(AiMessageCitationMapper.class);
        AiMessageFeedbackMapper feedbackMapper = mock(AiMessageFeedbackMapper.class);

        AiConversation conversation = new AiConversation();
        conversation.setId(8L);
        conversation.setUserId(3L);
        when(conversationMapper.findByIdAndUserId(8L, 3L)).thenReturn(conversation);

        AiMessage message = new AiMessage();
        message.setId(21L);
        message.setConversationId(8L);
        message.setRole("assistant");
        message.setContent("回答");
        when(messageMapper.findByIdAndConversationId(21L, 8L)).thenReturn(message);
        when(feedbackMapper.upsert(org.mockito.ArgumentMatchers.any())).thenReturn(1);
        when(citationMapper.findAllByConversationId(8L)).thenReturn(List.of());

        AiMessageFeedback saved = new AiMessageFeedback();
        saved.setMessageId(21L);
        saved.setUserId(3L);
        saved.setHelpful(false);
        saved.setReason("时间不准确");
        when(feedbackMapper.findByUserIdAndMessageId(3L, 21L)).thenReturn(saved);

        AiMessageService service = new AiMessageServiceImpl(
                conversationMapper,
                messageMapper,
                citationMapper,
                feedbackMapper,
                mock(UserMapper.class),
                mock(AiModelClient.class),
                mock(KnowledgeSearchService.class)
        );

        MessageFeedbackRequest request = new MessageFeedbackRequest();
        request.setHelpful(false);
        request.setReason("  时间不准确  ");

        MessageResponse response = service.updateFeedback(3L, 8L, 21L, request);

        assertThat(response.getHelpful()).isFalse();
        assertThat(response.getFeedbackReason()).isEqualTo("时间不准确");

        ArgumentCaptor<AiMessageFeedback> captor =
                ArgumentCaptor.forClass(AiMessageFeedback.class);
        verify(feedbackMapper).upsert(captor.capture());
        assertThat(captor.getValue().getReason()).isEqualTo("时间不准确");
    }
}
