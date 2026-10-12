package com.campusai.service.impl;

import com.campusai.dto.CreateKnowledgeDocumentRequest;
import com.campusai.dto.CreateKnowledgeSubmissionRequest;
import com.campusai.dto.KnowledgeImportResponse;
import com.campusai.dto.KnowledgeSubmissionResponse;
import com.campusai.knowledge.submission.entity.KnowledgeSubmission;
import com.campusai.mapper.KnowledgeSubmissionMapper;
import com.campusai.mapper.UserMapper;
import com.campusai.service.KnowledgeDocumentService;
import com.campusai.service.KnowledgeSubmissionService;
import com.campusai.user.entity.User;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.List;

@Service
public class KnowledgeSubmissionServiceImpl
        implements KnowledgeSubmissionService {

    private final KnowledgeSubmissionMapper submissionMapper;
    private final UserMapper userMapper;
    private final KnowledgeDocumentService documentService;

    public KnowledgeSubmissionServiceImpl(
            KnowledgeSubmissionMapper submissionMapper,
            UserMapper userMapper,
            KnowledgeDocumentService documentService) {

        this.submissionMapper = submissionMapper;
        this.userMapper = userMapper;
        this.documentService = documentService;
    }

    @Override
    @Transactional
    public KnowledgeSubmissionResponse submit(
            Long userId,
            CreateKnowledgeSubmissionRequest request) {

        User user = requireUser(userId);

        KnowledgeSubmission submission = new KnowledgeSubmission();
        submission.setSchoolId(user.getSchoolId());
        submission.setUserId(userId);
        submission.setQuestion(request.getQuestion().trim());
        submission.setContent(request.getContent().trim());
        submission.setSourceUrl(trimToNull(request.getSourceUrl()));
        submission.setStatus("PENDING");

        if (submissionMapper.insert(submission) != 1) {
            throw new IllegalStateException("校园资料提交失败");
        }

        return KnowledgeSubmissionResponse.from(
                submissionMapper.findByIdAndSchoolId(
                        submission.getId(),
                        user.getSchoolId()
                )
        );
    }

    @Override
    public List<KnowledgeSubmissionResponse> findMine(Long userId) {
        requireUser(userId);

        return submissionMapper.findByUserId(userId)
                .stream()
                .map(KnowledgeSubmissionResponse::from)
                .toList();
    }

    @Override
    public List<KnowledgeSubmissionResponse> findPending(Long schoolId) {
        return submissionMapper.findPendingBySchoolId(schoolId)
                .stream()
                .map(KnowledgeSubmissionResponse::from)
                .toList();
    }

    @Override
    @Transactional
    public KnowledgeSubmissionResponse approve(
            Long reviewerId,
            Long schoolId,
            Long submissionId) {

        KnowledgeSubmission submission = requirePending(
                submissionId,
                schoolId
        );

        CreateKnowledgeDocumentRequest documentRequest =
                new CreateKnowledgeDocumentRequest();

        documentRequest.setSchoolId(schoolId);
        documentRequest.setTitle(toDocumentTitle(submission.getQuestion()));
        documentRequest.setCategory("用户补充");
        documentRequest.setSourceDepartment("Campus AI 用户贡献");
        documentRequest.setSourceUrl(submission.getSourceUrl());
        documentRequest.setPublishedAt(LocalDateTime.now());
        documentRequest.setContent(submission.getContent());

        KnowledgeImportResponse importResponse =
                documentService.importDocument(documentRequest);

        int updated = submissionMapper.markApproved(
                submissionId,
                schoolId,
                reviewerId,
                importResponse.duplicate()
                        ? "内容已存在，已关联现有知识资料"
                        : "审核通过并加入校园知识库",
                importResponse.documentId()
        );

        if (updated != 1) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "该资料已被其他管理员处理"
            );
        }

        return KnowledgeSubmissionResponse.from(
                submissionMapper.findByIdAndSchoolId(
                        submissionId,
                        schoolId
                )
        );
    }

    @Override
    @Transactional
    public KnowledgeSubmissionResponse mergeIntoDocument(Long reviewerId, Long schoolId,
            Long submissionId, Long documentId, CreateKnowledgeDocumentRequest reviewedDocument) {
        requirePending(submissionId, schoolId);
        if (!schoolId.equals(reviewedDocument.getSchoolId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "只能合并本校资料");
        }
        KnowledgeImportResponse revised = documentService.revise(
                schoolId, documentId, reviewerId, reviewedDocument);
        if (submissionMapper.markApproved(submissionId, schoolId, reviewerId,
                "管理员核实后合并至资料新版本 #" + revised.documentId(), revised.documentId()) != 1) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "投稿已被其他管理员处理");
        }
        return KnowledgeSubmissionResponse.from(
                submissionMapper.findByIdAndSchoolId(submissionId, schoolId));
    }

    @Override
    @Transactional
    public KnowledgeSubmissionResponse reject(
            Long reviewerId,
            Long schoolId,
            Long submissionId,
            String reviewNote) {

        requirePending(submissionId, schoolId);

        int updated = submissionMapper.markRejected(
                submissionId,
                schoolId,
                reviewerId,
                reviewNote.trim()
        );

        if (updated != 1) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "该资料已被其他管理员处理"
            );
        }

        return KnowledgeSubmissionResponse.from(
                submissionMapper.findByIdAndSchoolId(
                        submissionId,
                        schoolId
                )
        );
    }

    private User requireUser(Long userId) {
        User user = userMapper.findById(userId);

        if (user == null) {
            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED,
                    "当前用户不存在"
            );
        }

        return user;
    }

    private KnowledgeSubmission requirePending(
            Long submissionId,
            Long schoolId) {

        KnowledgeSubmission submission =
                submissionMapper.findByIdAndSchoolId(
                        submissionId,
                        schoolId
                );

        if (submission == null) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "未找到待审核资料"
            );
        }

        if (!"PENDING".equals(submission.getStatus())) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "该资料已经审核"
            );
        }

        return submission;
    }

    private String toDocumentTitle(String question) {
        String title = question.replaceAll("\\s+", " ").trim();
        return title.length() <= 200
                ? title
                : title.substring(0, 200);
    }

    private String trimToNull(String value) {
        return value == null || value.isBlank()
                ? null
                : value.trim();
    }
}
