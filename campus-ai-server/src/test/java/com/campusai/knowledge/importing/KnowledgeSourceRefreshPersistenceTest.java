package com.campusai.knowledge.importing;

import com.campusai.dto.CreateKnowledgeDocumentRequest;
import com.campusai.dto.KnowledgeImportResponse;
import com.campusai.knowledge.entity.KnowledgeDocument;
import com.campusai.mapper.KnowledgeDocumentMapper;
import com.campusai.service.KnowledgeDocumentService;
import org.junit.jupiter.api.*;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.UUID;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** Isolated H2 SQL/transaction evidence, not production or full revision-service validation. */
@Timeout(10)
class KnowledgeSourceRefreshPersistenceTest {
    JdbcTemplate jdbc;
    KnowledgeSourceRefreshService service;
    KnowledgeDocumentService revisions;
    AtomicLong nextId;

    @BeforeEach void setup() throws Exception {
        var source = new DriverManagerDataSource("jdbc:h2:mem:source_refresh_" + UUID.randomUUID()
                + ";MODE=MySQL;DB_CLOSE_DELAY=-1;LOCK_TIMEOUT=4000", "sa", "");
        jdbc = spy(new JdbcTemplate(source));
        jdbc.execute("CREATE TABLE knowledge_documents(id BIGINT PRIMARY KEY, school_id BIGINT, "
                + "status VARCHAR(24), source_url VARCHAR(1000), content_hash CHAR(64), raw_content CLOB)");
        jdbc.execute("CREATE TABLE knowledge_update_candidates(id BIGINT PRIMARY KEY, school_id BIGINT, "
                + "document_id BIGINT, source_url VARCHAR(1000), detected_title VARCHAR(200), detected_content CLOB, "
                + "previous_hash CHAR(64), detected_hash CHAR(64), status VARCHAR(20), reviewed_by BIGINT, reviewed_at TIMESTAMP)");
        jdbc.update("INSERT INTO knowledge_documents VALUES (11,7,'PUBLISHED',?,?,?)", url(), hash("old"), "old");
        candidate(29L, "new content");
        var documents = mock(KnowledgeDocumentMapper.class);
        when(documents.findLockedByIdAndSchoolId(anyLong(), anyLong())).thenAnswer(invocation -> {
            var rows = jdbc.query("SELECT * FROM knowledge_documents WHERE id=? AND school_id=? FOR UPDATE",
                    (result, row) -> {
                        var document = new KnowledgeDocument();
                        document.setId(result.getLong("id"));
                        document.setSchoolId(result.getLong("school_id"));
                        document.setStatus(result.getString("status"));
                        document.setSourceUrl(result.getString("source_url"));
                        document.setContentHash(result.getString("content_hash"));
                        document.setCategory("办事");
                        return document;
                    }, invocation.getArgument(0), invocation.getArgument(1));
            return rows.isEmpty() ? null : rows.get(0);
        });
        // Simulate the revision's database mutations so real rollback/row-lock behavior is observable.
        // The real revision service is covered separately by its lifecycle/date tests.
        revisions = mock(KnowledgeDocumentService.class);
        nextId = new AtomicLong(41);
        when(revisions.revise(eq(7L), eq(11L), eq(3L), any())).thenAnswer(invocation -> {
            CreateKnowledgeDocumentRequest request = invocation.getArgument(3);
            jdbc.update("UPDATE knowledge_documents SET status='ARCHIVED' WHERE id=11 AND school_id=7");
            long id = nextId.incrementAndGet();
            jdbc.update("INSERT INTO knowledge_documents VALUES (?,7,'PUBLISHED',?,?,?)",
                    id, request.getSourceUrl(), hash(request.getContent()), request.getContent());
            return new KnowledgeImportResponse(id, 1, false);
        });
        var target = new KnowledgeSourceRefreshService(mock(KnowledgeImportPreviewService.class), documents, revisions, jdbc);
        var interceptor = new TransactionInterceptor();
        interceptor.setTransactionManager(new DataSourceTransactionManager(source));
        interceptor.setTransactionAttributeSource(new AnnotationTransactionAttributeSource());
        var proxy = new ProxyFactory(target);
        proxy.setProxyTargetClass(true);
        proxy.addAdvice(interceptor);
        service = (KnowledgeSourceRefreshService) proxy.getProxy();
    }

    @AfterEach void close() { jdbc.execute("SHUTDOWN"); }

    @Test void revisionAndReviewCommitTogether() {
        assertThat(service.apply(7L, 29L, 3L).documentId()).isEqualTo(42L);
        assertThat(status()).isEqualTo("ARCHIVED");
        assertThat(candidateStatus(29)).isEqualTo("APPLIED");
        assertThat(jdbc.queryForObject("SELECT reviewed_by FROM knowledge_update_candidates WHERE id=29", Long.class)).isEqualTo(3L);
        assertThat(documentCount()).isEqualTo(2);
    }

    @Test void missingAuditUpdateRollsBackTheRevision() {
        doReturn(0).when(jdbc).update(startsWith("UPDATE knowledge_update_candidates SET status = 'APPLIED'"), any(Object[].class));
        assertThatThrownBy(() -> service.apply(7L, 29L, 3L))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        failure -> assertThat(failure.getStatusCode()).isEqualTo(HttpStatus.CONFLICT));
        assertThat(status()).isEqualTo("PUBLISHED");
        assertThat(documentCount()).isEqualTo(1);
        assertThat(candidateStatus(29)).isEqualTo("PENDING");
    }

    @Test void replayCannotCreateAnotherVersion() {
        service.apply(7L, 29L, 3L);
        assertThatThrownBy(() -> service.apply(7L, 29L, 3L)).isInstanceOf(ResponseStatusException.class);
        assertThat(documentCount()).isEqualTo(2);
        verify(revisions, times(1)).revise(any(), any(), any(), any());
    }

    @Test void concurrentCandidatesCannotBothReplaceTheSameBaseline() throws Exception {
        candidate(30L, "different new content");
        var pool = Executors.newFixedThreadPool(2);
        var start = new CountDownLatch(1);
        try {
            Callable<Boolean> first = () -> applyAtOnce(start, 29L);
            Callable<Boolean> second = () -> applyAtOnce(start, 30L);
            var a = pool.submit(first); var b = pool.submit(second); start.countDown();
            assertThat((a.get(6, TimeUnit.SECONDS) ? 1 : 0) + (b.get(6, TimeUnit.SECONDS) ? 1 : 0)).isEqualTo(1);
            assertThat(documentCount()).isEqualTo(2);
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM knowledge_update_candidates WHERE status='APPLIED'", Integer.class)).isEqualTo(1);
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM knowledge_update_candidates WHERE status='PENDING'", Integer.class)).isEqualTo(1);
        } finally {
            pool.shutdownNow(); assertThat(pool.awaitTermination(2, TimeUnit.SECONDS)).isTrue();
        }
    }

    private boolean applyAtOnce(CountDownLatch start, long id) throws InterruptedException {
        if (!start.await(1, TimeUnit.SECONDS)) throw new IllegalStateException("test start timed out");
        try { service.apply(7L, id, 3L); return true; }
        catch (ResponseStatusException failure) {
            assertThat(failure.getStatusCode()).isEqualTo(HttpStatus.CONFLICT); return false;
        }
    }
    private void candidate(long id, String content) throws Exception {
        jdbc.update("INSERT INTO knowledge_update_candidates VALUES (?,7,11,?,'官网标题',?,?,?,'PENDING',NULL,NULL)",
                id, url(), content, hash("old"), hash(content));
    }
    private String status() { return jdbc.queryForObject("SELECT status FROM knowledge_documents WHERE id=11", String.class); }
    private String candidateStatus(long id) { return jdbc.queryForObject("SELECT status FROM knowledge_update_candidates WHERE id=?", String.class, id); }
    private int documentCount() { return jdbc.queryForObject("SELECT COUNT(*) FROM knowledge_documents", Integer.class); }
    private String url() { return "https://www.tsguas.edu.cn/notice.html"; }
    private String hash(String value) throws Exception {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
    }
}
