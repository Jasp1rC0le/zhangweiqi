package com.campusai.mapper;

import com.campusai.message.entity.AiMessage;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface AiMessageMapper {

    int insert(AiMessage message);

    AiMessage findById(
            @Param("id") Long id
    );

    AiMessage findByIdAndConversationId(
            @Param("id") Long id,
            @Param("conversationId") Long conversationId
    );

    List<AiMessage> findAllByConversationId(
            @Param("conversationId")
            Long conversationId
    );

    List<AiMessage> findRecentByConversationId(
            @Param("conversationId")
            Long conversationId,

            @Param("limit")
            Integer limit
    );
}
