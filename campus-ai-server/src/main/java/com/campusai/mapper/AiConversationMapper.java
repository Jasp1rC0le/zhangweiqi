package com.campusai.mapper;

import com.campusai.conversation.entity.AiConversation;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface AiConversationMapper {

    int insert(AiConversation conversation);

    AiConversation findByIdAndUserId(
            @Param("id") Long id,
            @Param("userId") Long userId
    );

    List<AiConversation> findAllByUserId(
            @Param("userId") Long userId
    );

    int updateAfterChat(
            @Param("id") Long id,
            @Param("userId") Long userId,
            @Param("title") String title,
            @Param("model") String model
    );

    int deleteByIdAndUserId(
            @Param("id") Long id,
            @Param("userId") Long userId
    );
}