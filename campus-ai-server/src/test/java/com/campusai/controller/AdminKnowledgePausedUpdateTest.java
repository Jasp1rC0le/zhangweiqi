package com.campusai.controller;

import com.campusai.jobs.BackgroundJobRepository;
import com.campusai.service.KnowledgeDocumentService;
import com.campusai.service.UserService;
import com.campusai.user.entity.User;
import com.campusai.knowledge.entity.KnowledgeDocument;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class AdminKnowledgePausedUpdateTest {
    final KnowledgeDocumentService documents=mock(KnowledgeDocumentService.class);
    final UserService users=mock(UserService.class);
    final BackgroundJobRepository jobs=mock(BackgroundJobRepository.class);
    void admin() {
        var user=new User();user.setRole("ADMIN");user.setStatus(1);user.setSchoolId(7L);
        when(users.getById(1L)).thenReturn(user);
    }
    @Test void pausedManualSourceUpdateCannotSilentlyAccumulatePendingJobs() {
        admin();var controller=new AdminKnowledgeController(documents,null,users,null,null,null,jobs,false);
        assertThatThrownBy(()->controller.checkUpdate(1L,"ADMIN",4L))
                .isInstanceOfSatisfying(ResponseStatusException.class,error->{
                    assertThat(error.getStatusCode().value()).isEqualTo(503);
                    assertThat(error.getReason()).contains("未加入队列");
                });
        verifyNoInteractions(jobs,documents);
    }
    @Test void roleAndRevocationAreCheckedBeforeRuntimeGate() {
        var controller=new AdminKnowledgeController(documents,null,users,null,null,null,jobs,false);
        assertThatThrownBy(()->controller.checkUpdate(1L,"STUDENT",4L))
                .isInstanceOfSatisfying(ResponseStatusException.class,error->assertThat(error.getStatusCode().value()).isEqualTo(403));
        verifyNoInteractions(users,jobs,documents);
        var user=new User();user.setRole("STUDENT");user.setStatus(1);when(users.getById(1L)).thenReturn(user);
        assertThatThrownBy(()->controller.checkUpdate(1L,"ADMIN",4L)).isInstanceOf(ResponseStatusException.class);
        verifyNoInteractions(jobs,documents);
    }
    @Test void enabledUpdatesStillUseCurrentSchoolAndPublishedSource() {
        admin();var controller=new AdminKnowledgeController(documents,null,users,null,null,null,jobs,true);
        var document=new KnowledgeDocument();document.setStatus("PUBLISHED");document.setSourceUrl("https://www.tsguas.edu.cn/xxgk.htm");
        when(documents.findOne(7L,4L)).thenReturn(document);
        assertThat(controller.checkUpdate(1L,"ADMIN",4L).getStatusCode().value()).isEqualTo(202);
        verify(jobs).enqueueKnowledgeRefreshNow(7L,4L);
        document.setStatus("ARCHIVED");
        assertThatThrownBy(()->controller.checkUpdate(1L,"ADMIN",4L)).isInstanceOf(ResponseStatusException.class);
        verifyNoMoreInteractions(jobs);
    }
}
