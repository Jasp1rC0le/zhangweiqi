package com.campusai.knowledge.importing;

import com.campusai.dto.KnowledgeImportResponse;
import com.campusai.mapper.SchoolMapper;
import com.campusai.school.entity.School;
import com.campusai.service.KnowledgeDocumentService;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class OfficialSchoolKnowledgeSeederTest {
    @Test
    void seedsBothExistingSchoolIdsWithoutTouchingOtherSchools() {
        SchoolMapper schools = mock(SchoolMapper.class);
        KnowledgeDocumentService documents = mock(KnowledgeDocumentService.class);
        when(schools.findAllActive()).thenReturn(List.of(
                school(1L, "天津中德应用技术大学", "TSGU"),
                school(2L, "天津中德应用技术大学", "TSGUAS"),
                school(3L, "其他学校", "OTHER")));
        when(documents.importDocument(any())).thenReturn(new KnowledgeImportResponse(10L, 1, false));

        new OfficialSchoolKnowledgeSeeder(schools, documents, true).importOfficialFacts();

        verify(documents, times(4)).importDocument(argThat(item -> item.getSchoolId() == 1L));
        verify(documents, times(4)).importDocument(argThat(item -> item.getSchoolId() == 2L));
        verify(documents, never()).importDocument(argThat(item -> item.getSchoolId() == 3L));
        verify(documents, times(2)).importDocument(argThat(item ->
                item.getContent().contains("022-28776099、022-28776655")
                && item.getContent().contains("https://zs.tsguas.edu.cn/")
                && !item.getContent().contains("因此只提供共同号码")));
    }

    private static School school(Long id, String name, String code) {
        School school = new School();
        school.setId(id);
        school.setName(name);
        school.setCode(code);
        return school;
    }
}
