package com.campusai.mapper;

import com.campusai.knowledge.entity.KnowledgeDocument;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;

@Mapper
public interface KnowledgeDocumentMapper {

    int insert(KnowledgeDocument document);

    KnowledgeDocument findBySchoolIdAndContentHash(
            @Param("schoolId") Long schoolId,
            @Param("contentHash") String contentHash
    );

    List<KnowledgeDocument> findPotentialConflicts(@Param("schoolId") Long schoolId,
            @Param("title") String title, @Param("sourceUrl") String sourceUrl);

    KnowledgeDocument findByIdAndSchoolId(@Param("id") Long id, @Param("schoolId") Long schoolId);

    KnowledgeDocument findLockedByIdAndSchoolId(@Param("id") Long id, @Param("schoolId") Long schoolId);

    int countEditable(@Param("schoolId") Long schoolId,@Param("pattern") String pattern);
    List<KnowledgeDocument> pageEditable(@Param("schoolId") Long schoolId,@Param("pattern") String pattern,@Param("offset") int offset,@Param("size") int size);

    KnowledgeDocument findCurrentEvaluationTarget(@Param("id") Long id, @Param("schoolId") Long schoolId);

    List<KnowledgeDocument> findRecentBySchoolId(@Param("schoolId") Long schoolId);

    List<KnowledgeDocument> scanBySchoolId(@Param("schoolId") Long schoolId,
                                          @Param("beforeId") Long beforeId);

    int updateStatus(@Param("id") Long id, @Param("schoolId") Long schoolId,
                     @Param("expectedStatus") String expectedStatus, @Param("status") String status);

    int updateDates(@Param("before") KnowledgeDocument before,
                    @Param("after") KnowledgeDocument after);

    List<KnowledgeDocument> findVersions(@Param("schoolId") Long schoolId,
                                         @Param("rootDocumentId") Long rootDocumentId);
}
