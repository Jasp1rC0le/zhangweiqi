package com.campusai.mapper;

import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface KnowledgeDocumentEventMapper {
    @Insert("""
            insert into knowledge_document_events
            (document_id, actor_id, old_status, new_status, note)
            values (#{documentId}, #{actorId}, #{oldStatus}, #{newStatus}, #{note})
            """)
    int insert(@Param("documentId") Long documentId, @Param("actorId") Long actorId,
               @Param("oldStatus") String oldStatus, @Param("newStatus") String newStatus,
               @Param("note") String note);
}
