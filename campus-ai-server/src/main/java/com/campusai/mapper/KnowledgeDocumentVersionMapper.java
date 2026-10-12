package com.campusai.mapper;

import com.campusai.knowledge.model.KnowledgeDocumentVersion;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface KnowledgeDocumentVersionMapper {
    @Insert("""
            insert into knowledge_document_versions
            (document_id, root_document_id, version_number, supersedes_document_id)
            values (#{documentId}, #{rootDocumentId}, #{versionNumber}, #{supersedesDocumentId})
            """)
    int insert(KnowledgeDocumentVersion value);

    @Select("select document_id, root_document_id, version_number, supersedes_document_id "
            + "from knowledge_document_versions where document_id = #{id}")
    KnowledgeDocumentVersion findByDocumentId(@Param("id") Long id);

    @Update("""
            update knowledge_document_versions
            set root_document_id = #{rootId}, version_number = #{versionNumber},
                supersedes_document_id = #{previousId}
            where document_id = #{documentId}
            """)
    int updateLink(@Param("documentId") Long documentId, @Param("rootId") Long rootId,
                   @Param("versionNumber") int versionNumber,
                   @Param("previousId") Long previousId);

    @Select("select count(*) from knowledge_document_versions where supersedes_document_id = #{id}")
    int countSuccessors(@Param("id") Long id);
}
