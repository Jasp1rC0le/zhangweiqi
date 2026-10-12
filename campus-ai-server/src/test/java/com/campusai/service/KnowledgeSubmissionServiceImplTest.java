package com.campusai.service;

import com.campusai.dto.CreateKnowledgeSubmissionRequest;
import com.campusai.dto.CreateKnowledgeDocumentRequest;
import com.campusai.dto.KnowledgeImportResponse;
import com.campusai.dto.KnowledgeSubmissionResponse;
import com.campusai.knowledge.submission.entity.KnowledgeSubmission;
import com.campusai.mapper.KnowledgeSubmissionMapper;
import com.campusai.mapper.UserMapper;
import com.campusai.service.impl.KnowledgeSubmissionServiceImpl;
import com.campusai.user.entity.User;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class KnowledgeSubmissionServiceImplTest {

    @Test
    void shouldMergeReviewedSubmissionIntoNewDocumentVersion() {
        KnowledgeSubmission pending = new KnowledgeSubmission();
        pending.setId(14L);
        pending.setSchoolId(3L);
        pending.setStatus("PENDING");
        KnowledgeSubmission approved = new KnowledgeSubmission();
        approved.setId(14L);
        approved.setSchoolId(3L);
        approved.setStatus("APPROVED");
        approved.setKnowledgeDocumentId(22L);
        when(submissionMapper.findByIdAndSchoolId(14L, 3L)).thenReturn(pending, approved);
        CreateKnowledgeDocumentRequest reviewed = new CreateKnowledgeDocumentRequest();
        reviewed.setSchoolId(3L);
        reviewed.setTitle("图书馆通知");
        reviewed.setCategory("校园事务");
        reviewed.setContent("管理员核对后的完整正文");
        when(documentService.revise(3L, 20L, 9L, reviewed))
                .thenReturn(new KnowledgeImportResponse(22L, 1, false));
        when(submissionMapper.markApproved(14L, 3L, 9L,
                "管理员核实后合并至资料新版本 #22", 22L)).thenReturn(1);
        KnowledgeSubmissionService service = new KnowledgeSubmissionServiceImpl(
                submissionMapper, userMapper, documentService);

        KnowledgeSubmissionResponse result = service.mergeIntoDocument(9L, 3L, 14L, 20L, reviewed);
        assertThat(result.getKnowledgeDocumentId()).isEqualTo(22L);
        verify(documentService).revise(3L, 20L, 9L, reviewed);
    }

    @Mock
    private KnowledgeSubmissionMapper submissionMapper;
    @Mock
    private UserMapper userMapper;
    @Mock
    private KnowledgeDocumentService documentService;

    @Test
    void shouldBindSubmissionToCurrentUsersSchool() {
        User user = new User();
        user.setId(7L);
        user.setSchoolId(3L);
        when(userMapper.findById(7L)).thenReturn(user);
        when(submissionMapper.insert(any(KnowledgeSubmission.class)))
                .thenAnswer(invocation -> {
                    KnowledgeSubmission submission = invocation.getArgument(0);
                    submission.setId(11L);
                    return 1;
                });
        when(submissionMapper.findByIdAndSchoolId(11L, 3L))
                .thenAnswer(invocation -> {
                    KnowledgeSubmission submission = new KnowledgeSubmission();
                    submission.setId(11L);
                    submission.setSchoolId(3L);
                    submission.setUserId(7L);
                    submission.setQuestion("图书馆几点关门？");
                    submission.setContent("工作日 22:00 关闭");
                    submission.setStatus("PENDING");
                    return submission;
                });

        CreateKnowledgeSubmissionRequest request =
                new CreateKnowledgeSubmissionRequest();
        request.setQuestion("  图书馆几点关门？  ");
        request.setContent("  工作日 22:00 关闭  ");
        request.setSourceUrl("  https://example.com/library  ");

        KnowledgeSubmissionService service =
                new KnowledgeSubmissionServiceImpl(
                        submissionMapper,
                        userMapper,
                        documentService
                );

        KnowledgeSubmissionResponse response = service.submit(7L, request);

        ArgumentCaptor<KnowledgeSubmission> captor =
                ArgumentCaptor.forClass(KnowledgeSubmission.class);
        verify(submissionMapper).insert(captor.capture());
        KnowledgeSubmission saved = captor.getValue();
        assertThat(saved.getSchoolId()).isEqualTo(3L);
        assertThat(saved.getUserId()).isEqualTo(7L);
        assertThat(saved.getQuestion()).isEqualTo("图书馆几点关门？");
        assertThat(saved.getContent()).isEqualTo("工作日 22:00 关闭");
        assertThat(saved.getSourceUrl()).isEqualTo("https://example.com/library");
        assertThat(response.getStatus()).isEqualTo("PENDING");
    }
}
