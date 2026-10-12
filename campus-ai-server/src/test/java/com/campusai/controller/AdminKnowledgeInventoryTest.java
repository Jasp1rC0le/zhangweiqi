package com.campusai.controller;

import com.campusai.service.KnowledgeDocumentService;
import com.campusai.service.UserService;
import com.campusai.user.entity.User;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

class AdminKnowledgeInventoryTest {
    final KnowledgeDocumentService documents=mock(KnowledgeDocumentService.class);
    final UserService users=mock(UserService.class);
    final AdminKnowledgeController controller=new AdminKnowledgeController(documents,null,users,null,null,null,null);
    @Test void rejectsNonAdminBeforeQuerying() {
        assertThatThrownBy(()->controller.scanDocuments(1L,"STUDENT",null)).isInstanceOf(ResponseStatusException.class);
        verifyNoInteractions(documents,users);
    }
    @Test void checksDatabaseRoleAndStatusOnEveryPage() {
        var user=new User();user.setRole("STUDENT");user.setStatus(1);
        when(users.getById(1L)).thenReturn(user);
        assertThatThrownBy(()->controller.scanDocuments(1L,"ADMIN",20L)).isInstanceOf(ResponseStatusException.class);
        user.setRole("ADMIN");user.setStatus(0);
        assertThatThrownBy(()->controller.scanDocuments(1L,"ADMIN",20L)).isInstanceOf(ResponseStatusException.class);
        verifyNoInteractions(documents);
    }
    @Test void usesDatabaseSchoolNotCallerInput() {
        var user=new User();user.setRole("ADMIN");user.setStatus(1);user.setSchoolId(7L);
        when(users.getById(1L)).thenReturn(user);
        controller.scanDocuments(1L,"ADMIN",50L);
        verify(documents).scan(7L,50L);
    }
}
