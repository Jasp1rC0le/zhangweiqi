package com.campusai.mapper;

import com.campusai.knowledge.model.CitationSourceResult;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface AiMessageCitationMapper {

    int insert(
            @Param("messageId") Long messageId,
            @Param("chunkId") Long chunkId,
            @Param("citationIndex") Integer citationIndex
    );

    List<CitationSourceResult> findAllByConversationId(
            @Param("conversationId") Long conversationId
    );
}