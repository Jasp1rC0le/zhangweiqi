package com.campusai.service;

import com.campusai.mapper.AiConversationMapper;
import com.campusai.service.impl.AiConversationServiceImpl;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AiConversationServiceImplTest {

    @Test
    void shouldDeleteOnlyConversationOwnedByCurrentUser() {
        AiConversationMapper mapper = mock(AiConversationMapper.class);
        when(mapper.deleteByIdAndUserId(18L, 7L)).thenReturn(1);
        AiConversationService service = new AiConversationServiceImpl(mapper);

        boolean deleted = service.deleteById(7L, 18L);

        assertThat(deleted).isTrue();
        verify(mapper).deleteByIdAndUserId(18L, 7L);
    }

    @Test
    void shouldReportFalseWhenConversationDoesNotBelongToUser() {
        AiConversationMapper mapper = mock(AiConversationMapper.class);
        when(mapper.deleteByIdAndUserId(18L, 99L)).thenReturn(0);
        AiConversationService service = new AiConversationServiceImpl(mapper);

        assertThat(service.deleteById(99L, 18L)).isFalse();
    }
}
