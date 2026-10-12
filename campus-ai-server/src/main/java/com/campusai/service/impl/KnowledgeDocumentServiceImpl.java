package com.campusai.service.impl;

import com.campusai.dto.CreateKnowledgeDocumentRequest;
import com.campusai.dto.KnowledgeImportResponse;
import com.campusai.knowledge.entity.KnowledgeChunk;
import com.campusai.knowledge.entity.KnowledgeDocument;
import com.campusai.knowledge.model.KnowledgeDocumentVersion;
import com.campusai.knowledge.semantic.KnowledgeIndexRequested;
import com.campusai.mapper.KnowledgeChunkMapper;
import com.campusai.mapper.KnowledgeDocumentMapper;
import com.campusai.mapper.KnowledgeDocumentEventMapper;
import com.campusai.mapper.KnowledgeDocumentVersionMapper;
import com.campusai.service.KnowledgeDocumentService;
import org.springframework.http.HttpStatus;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;
import java.util.Objects;

@Service
public class KnowledgeDocumentServiceImpl
        implements KnowledgeDocumentService {

    private static final int CHUNK_SIZE = 800;
    private static final int CHUNK_OVERLAP = 100;

    private final KnowledgeDocumentMapper documentMapper;
    private final KnowledgeChunkMapper chunkMapper;
    private final KnowledgeDocumentEventMapper eventMapper;
    private final KnowledgeDocumentVersionMapper versionMapper;
    private final ApplicationEventPublisher events;

    public KnowledgeDocumentServiceImpl(
            KnowledgeDocumentMapper documentMapper,
            KnowledgeChunkMapper chunkMapper,
            KnowledgeDocumentEventMapper eventMapper,
            KnowledgeDocumentVersionMapper versionMapper,
            ApplicationEventPublisher events) {

        this.documentMapper = documentMapper;
        this.chunkMapper = chunkMapper;
        this.eventMapper = eventMapper;
        this.versionMapper = versionMapper;
        this.events = events;
    }

    @Override
    public List<KnowledgeDocument> findRecent(Long schoolId) {
        return documentMapper.findRecentBySchoolId(schoolId);
    }

    @Override
    public List<KnowledgeDocument> scan(Long schoolId, Long beforeId) {
        if (beforeId != null && beforeId <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "资料分页位置无效");
        }
        return documentMapper.scanBySchoolId(schoolId, beforeId);
    }

    @Override
    public KnowledgeDocument findOne(Long schoolId, Long documentId) {
        KnowledgeDocument document = documentMapper.findByIdAndSchoolId(documentId, schoolId);
        if (document == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "资料不存在");
        KnowledgeDocumentVersion version = versionMapper.findByDocumentId(documentId);
        document.setVersionNumber(version == null ? 1 : version.getVersionNumber());
        document.setHasSuccessor(versionMapper.countSuccessors(documentId) > 0);
        return document;
    }

    @Override
    public List<KnowledgeDocument> findVersions(Long schoolId, Long documentId) {
        KnowledgeDocument document = findOne(schoolId, documentId);
        KnowledgeDocumentVersion version = versionMapper.findByDocumentId(documentId);
        if (version == null) return List.of(document);
        return documentMapper.findVersions(schoolId, version.getRootDocumentId());
    }

    @Override
    @Transactional
    public KnowledgeImportResponse revise(Long schoolId, Long documentId, Long actorId,
                                          CreateKnowledgeDocumentRequest request) {
        if (!schoolId.equals(request.getSchoolId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "只能修订本校资料");
        }
        KnowledgeDocument previous = findOne(schoolId, documentId);
        if (!"PUBLISHED".equals(previous.getStatus())
                || versionMapper.countSuccessors(documentId) != 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "只能修订当前发布的最新版本");
        }
        validateDates(request);
        String normalizedContent = normalizeContent(request.getContent());
        if (Objects.equals(previous.getContentHash(), calculateSha256(normalizedContent))
                && Objects.equals(previous.getTitle(), request.getTitle().trim())
                && Objects.equals(previous.getCategory(), request.getCategory().trim())
                && Objects.equals(previous.getSourceDepartment(), trimToNull(request.getSourceDepartment()))
                && Objects.equals(previous.getSourceUrl(), trimToNull(request.getSourceUrl()))) {
            if (Objects.equals(previous.getPublishedAt(), request.getPublishedAt())
                    && Objects.equals(previous.getEffectiveAt(), request.getEffectiveAt())
                    && Objects.equals(previous.getExpiresAt(), request.getExpiresAt())) {
                return new KnowledgeImportResponse(documentId, 0, true);
            }
            KnowledgeDocument corrected = createDocument(request, normalizedContent, previous.getContentHash());
            if (documentMapper.updateDates(previous, corrected) != 1) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "资料日期已被修改，请重新读取后核对");
            }
            String audit = "日期更正；发布时间 " + previous.getPublishedAt() + " → " + request.getPublishedAt()
                    + "；生效时间 " + previous.getEffectiveAt() + " → " + request.getEffectiveAt()
                    + "；失效时间 " + previous.getExpiresAt() + " → " + request.getExpiresAt();
            if (eventMapper.insert(documentId, actorId, "PUBLISHED", "PUBLISHED", audit) != 1) {
                throw new IllegalStateException("资料日期审计保存失败");
            }
            events.publishEvent(new KnowledgeIndexRequested(schoolId, documentId));
            return new KnowledgeImportResponse(documentId, 0, false, true);
        }
        if (documentMapper.updateStatus(documentId, schoolId, "PUBLISHED", "ARCHIVED") != 1) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "资料已被其他管理员修改");
        }
        eventMapper.insert(documentId, actorId, "PUBLISHED", "ARCHIVED", "由新版本替代");
        KnowledgeImportResponse imported = importDocument(request);
        if (imported.duplicate()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "修订正文与现有资料重复");
        }
        KnowledgeDocumentVersion oldVersion = versionMapper.findByDocumentId(documentId);
        Long rootId = oldVersion == null ? documentId : oldVersion.getRootDocumentId();
        int nextVersion = oldVersion == null ? 2 : oldVersion.getVersionNumber() + 1;
        if (oldVersion == null) {
            KnowledgeDocumentVersion root = new KnowledgeDocumentVersion();
            root.setDocumentId(documentId);
            root.setRootDocumentId(documentId);
            root.setVersionNumber(1);
            versionMapper.insert(root);
        }
        if (versionMapper.updateLink(imported.documentId(), rootId, nextVersion, documentId) != 1) {
            throw new IllegalStateException("资料版本关联失败");
        }
        return imported;
    }

    @Override
    @Transactional
    public List<KnowledgeImportResponse> reviseBatch(Long schoolId, Long actorId,
                                                     List<RevisionInput> revisions) {
        if (revisions == null || revisions.isEmpty() || revisions.size() > 20) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "每批须提交1至20份修订");
        }
        for (RevisionInput revision : revisions) {
            if (revision == null || revision.documentId() == null || revision.document() == null
                    || !schoolId.equals(revision.document().getSchoolId())) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "批量修订只能包含本校有效资料");
            }
        }
        return revisions.stream().map(item -> revise(
                schoolId, item.documentId(), actorId, item.document())).toList();
    }

    @Override
    @Transactional
    public KnowledgeDocument setPublished(Long schoolId, Long documentId, Long actorId,
                                          boolean published, String note) {
        KnowledgeDocument document = documentMapper.findByIdAndSchoolId(documentId, schoolId);
        if (document == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "资料不存在");
        }
        String next = published ? "PUBLISHED" : "ARCHIVED";
        if (next.equals(document.getStatus())) return document;
        if (published && versionMapper.countSuccessors(documentId) != 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "旧版本不能重新发布");
        }
        if (documentMapper.updateStatus(documentId, schoolId, document.getStatus(), next) != 1) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "资料状态已被其他管理员修改");
        }
        eventMapper.insert(documentId, actorId, document.getStatus(), next,
                note == null || note.isBlank() ? null : note.trim());
        return findOne(schoolId, documentId);
    }

    @Override
    @Transactional
    public KnowledgeImportResponse importDocument(
            CreateKnowledgeDocumentRequest request) {

        validateDates(request);

        String normalizedContent =
                normalizeContent(request.getContent());

        String contentHash =
                calculateSha256(normalizedContent);

        KnowledgeDocument existingDocument =
                documentMapper.findBySchoolIdAndContentHash(
                        request.getSchoolId(),
                        contentHash
                );

        if (existingDocument != null) {
            if (!"PUBLISHED".equals(existingDocument.getStatus())) {
                throw new ResponseStatusException(HttpStatus.CONFLICT,
                        "相同正文已存在于下架或历史资料 #" + existingDocument.getId()
                                + "，请核对版本并决定是否重新发布");
            }
            return new KnowledgeImportResponse(
                    existingDocument.getId(),
                    0,
                    true
            );
        }

        List<KnowledgeDocument> conflicts = documentMapper.findPotentialConflicts(
                request.getSchoolId(), request.getTitle().trim(), trimToNull(request.getSourceUrl()));
        if (conflicts != null && !conflicts.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "发现同来源或同标题的已发布资料 #" + conflicts.get(0).getId()
                            + "，请核实后修订该资料，不能直接覆盖或并存");
        }

        KnowledgeDocument document =
                createDocument(
                        request,
                        normalizedContent,
                        contentHash
                );

        int documentRows =
                documentMapper.insert(document);

        if (documentRows != 1) {
            throw new IllegalStateException(
                    "知识库资料保存失败"
            );
        }

        KnowledgeDocumentVersion first = new KnowledgeDocumentVersion();
        first.setDocumentId(document.getId());
        first.setRootDocumentId(document.getId());
        first.setVersionNumber(1);
        versionMapper.insert(first);

        int chunkCount =
                splitAndSaveChunks(
                        document.getId(),
                        normalizedContent
                );

        events.publishEvent(new KnowledgeIndexRequested(request.getSchoolId(), document.getId()));

        return new KnowledgeImportResponse(
                document.getId(),
                chunkCount,
                false
        );
    }

    @Override
    @Transactional
    public List<KnowledgeImportResponse> importBatch(Long schoolId,
                                                     List<CreateKnowledgeDocumentRequest> requests) {
        if (requests == null || requests.isEmpty() || requests.size() > 20) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "每批须提交1至20份资料");
        }
        for (CreateKnowledgeDocumentRequest request : requests) {
            if (request == null || !schoolId.equals(request.getSchoolId())) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "批量导入只能包含本校资料");
            }
        }
        return requests.stream().map(this::importDocument).toList();
    }

    private void validateDates(CreateKnowledgeDocumentRequest request) {
        if (request.getEffectiveAt() != null && request.getExpiresAt() != null
                && !request.getExpiresAt().isAfter(request.getEffectiveAt())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "资料失效时间必须晚于生效时间");
        }
    }

    private KnowledgeDocument createDocument(
            CreateKnowledgeDocumentRequest request,
            String normalizedContent,
            String contentHash) {

        KnowledgeDocument document =
                new KnowledgeDocument();

        document.setSchoolId(request.getSchoolId());

        document.setTitle(
                request.getTitle().trim()
        );

        document.setCategory(
                request.getCategory().trim()
        );

        document.setSourceDepartment(
                trimToNull(
                        request.getSourceDepartment()
                )
        );

        document.setSourceUrl(
                trimToNull(
                        request.getSourceUrl()
                )
        );

        document.setPublishedAt(
                request.getPublishedAt()
        );

        document.setEffectiveAt(
                request.getEffectiveAt()
        );

        document.setExpiresAt(
                request.getExpiresAt()
        );

        document.setStatus("PUBLISHED");
        document.setContentHash(contentHash);
        document.setRawContent(normalizedContent);

        return document;
    }

    private int splitAndSaveChunks(
            Long documentId,
            String content) {

        int[] codePoints =
                content.codePoints().toArray();

        int start = 0;
        int chunkIndex = 0;

        while (start < codePoints.length) {

            int end = Math.min(
                    start + CHUNK_SIZE,
                    codePoints.length
            );

            String chunkContent =
                    new String(
                            codePoints,
                            start,
                            end - start
                    ).trim();

            if (!chunkContent.isEmpty()) {
                saveChunk(
                        documentId,
                        chunkIndex,
                        chunkContent
                );

                chunkIndex++;
            }

            if (end >= codePoints.length) {
                break;
            }

            start = end - CHUNK_OVERLAP;
        }

        return chunkIndex;
    }

    private void saveChunk(
            Long documentId,
            Integer chunkIndex,
            String content) {

        KnowledgeChunk chunk =
                new KnowledgeChunk();

        chunk.setDocumentId(documentId);
        chunk.setChunkIndex(chunkIndex);
        chunk.setContent(content);
        chunk.setCharCount(
                content.codePointCount(
                        0,
                        content.length()
                )
        );
        chunk.setTokenCount(null);

        int affectedRows =
                chunkMapper.insert(chunk);

        if (affectedRows != 1) {
            throw new IllegalStateException(
                    "知识库片段保存失败"
            );
        }
    }

    private String normalizeContent(
            String content) {

        return content
                .replace("\r\n", "\n")
                .replace('\r', '\n')
                .trim();
    }

    private String calculateSha256(
            String content) {

        try {
            MessageDigest digest =
                    MessageDigest.getInstance(
                            "SHA-256"
                    );

            byte[] hash =
                    digest.digest(
                            content.getBytes(
                                    StandardCharsets.UTF_8
                            )
                    );

            return HexFormat.of()
                    .formatHex(hash);

        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException(
                    "当前Java环境不支持SHA-256",
                    exception
            );
        }
    }

    private String trimToNull(
            String value) {

        if (value == null || value.isBlank()) {
            return null;
        }

        return value.trim();
    }
}
