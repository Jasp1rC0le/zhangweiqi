package com.campusai.knowledge.importing;

import com.campusai.dto.KnowledgeImportPreview;
import com.campusai.knowledge.entity.KnowledgeDocument;
import com.campusai.mapper.KnowledgeDocumentMapper;
import com.campusai.service.KnowledgeDocumentService;
import org.junit.jupiter.api.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.sql.Timestamp;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.*;

/** Executes the actual snapshot-selection/upsert SQL in an isolated database; no website requests. */
@Timeout(10)
class KnowledgeSourceSnapshotPersistenceTest {
    JdbcTemplate jdbc;
    KnowledgeImportPreviewService previews;
    KnowledgeSourceRefreshService service;
    String url = "https://www.tsguas.edu.cn/notice.html";

    @BeforeEach void setup() throws Exception {
        var source = new DriverManagerDataSource("jdbc:h2:mem:source_snapshot_" + UUID.randomUUID()
                + ";MODE=MySQL;DB_CLOSE_DELAY=-1", "sa", "");
        jdbc = new JdbcTemplate(source);
        jdbc.execute("CREATE TABLE knowledge_documents(id BIGINT PRIMARY KEY, school_id BIGINT, "
                + "status VARCHAR(24), source_url VARCHAR(1000), content_hash CHAR(64))");
        jdbc.execute("CREATE TABLE knowledge_document_versions(document_id BIGINT PRIMARY KEY, root_document_id BIGINT)");
        jdbc.execute("CREATE TABLE knowledge_update_candidates(id BIGINT AUTO_INCREMENT PRIMARY KEY, school_id BIGINT, "
                + "document_id BIGINT, source_url VARCHAR(1000), detected_title VARCHAR(200), detected_content CLOB, "
                + "previous_hash CHAR(64), detected_hash CHAR(64), status VARCHAR(20) DEFAULT 'PENDING', "
                + "detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, reviewed_by BIGINT, reviewed_at TIMESTAMP, "
                + "UNIQUE(document_id, detected_hash))");
        insertDocument(11, 7, url, "人工整理摘要");
        var documents = mock(KnowledgeDocumentMapper.class);
        when(documents.findByIdAndSchoolId(anyLong(), anyLong())).thenAnswer(invocation -> {
            var rows = jdbc.query("SELECT * FROM knowledge_documents WHERE id=? AND school_id=?",
                    (result, row) -> {
                        var document = new KnowledgeDocument();
                        document.setId(result.getLong("id")); document.setSchoolId(result.getLong("school_id"));
                        document.setStatus(result.getString("status")); document.setSourceUrl(result.getString("source_url"));
                        document.setContentHash(result.getString("content_hash")); return document;
                    }, invocation.getArgument(0), invocation.getArgument(1));
            return rows.isEmpty() ? null : rows.get(0);
        });
        previews = mock(KnowledgeImportPreviewService.class);
        service = new KnowledgeSourceRefreshService(previews, documents, mock(KnowledgeDocumentService.class), jdbc);
    }

    @AfterEach void close() { jdbc.execute("SHUTDOWN"); }

    @Test void dismissedRawSnapshotSuppressesRepeatedSummaryDifference() throws Exception {
        reviewed(11, 7, url, "官网完整正文", "DISMISSED", "2026-10-11 13:00:00");
        fetch(url, "官网完整正文"); service.check(7L, 11L);
        assertThat(pending(11)).isZero(); assertThat(total()).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT content_hash FROM knowledge_documents WHERE id=11", String.class))
                .isEqualTo(hash("人工整理摘要"));
    }

    @Test void pendingSnapshotIsNotAnApprovedBaselineOrDuplicated() throws Exception {
        reviewed(11, 7, url, "官网完整正文", "PENDING", "2026-10-11 13:00:00");
        fetch(url, "官网完整正文"); service.check(7L, 11L);
        assertThat(pending(11)).isEqualTo(1); assertThat(total()).isEqualTo(1);
    }

    @Test void explicitRevisionFamilyInheritsReviewedOriginalSnapshot() throws Exception {
        reviewed(11, 7, url, "官网完整正文", "APPLIED", "2026-10-11 13:00:00");
        successor(url); fetch(url, "官网完整正文"); service.check(7L, 42L);
        assertThat(pending(42)).isZero(); assertThat(total()).isEqualTo(1);
    }

    @Test void unrelatedSameUrlDoesNotBorrowAReview() throws Exception {
        insertDocument(52, 7, url, "无关主题");
        reviewed(52, 7, url, "官网完整正文", "DISMISSED", "2026-10-11 13:00:00");
        fetch(url, "官网完整正文"); service.check(7L, 11L);
        assertThat(pending(11)).isEqualTo(1); assertThat(total()).isEqualTo(2);
    }

    @Test void anotherSchoolCannotSupplyTheBaseline() throws Exception {
        insertDocument(52, 8, url, "其他学校");
        reviewed(52, 8, url, "官网完整正文", "DISMISSED", "2026-10-11 13:00:00");
        fetch(url, "官网完整正文"); service.check(7L, 11L);
        assertThat(pending(11)).isEqualTo(1); assertThat(total()).isEqualTo(2);
    }

    @Test void changingSourceDoesNotReuseEarlierFamilyUrl() throws Exception {
        reviewed(11, 7, url, "官网完整正文", "DISMISSED", "2026-10-11 13:00:00");
        String differentUrl = "https://www.tsguas.edu.cn/new.html";
        successor(differentUrl); fetch(differentUrl, "官网完整正文"); service.check(7L, 42L);
        assertThat(pending(42)).isEqualTo(1);
    }

    @Test void newerReviewedSnapshotWinsAndReappearanceIsNotSilentlySwallowed() throws Exception {
        reviewed(11, 7, url, "原文A", "DISMISSED", "2026-10-11 13:00:00");
        reviewed(11, 7, url, "原文B", "DISMISSED", "2026-10-11 14:00:00");
        fetch(url, "原文A");
        assertThatThrownBy(() -> service.check(7L, 11L))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        failure -> assertThat(failure.getStatusCode()).isEqualTo(HttpStatus.CONFLICT));
        assertThat(total()).isEqualTo(2); assertThat(pending(11)).isZero();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM knowledge_update_candidates WHERE status='DISMISSED'", Integer.class))
                .isEqualTo(2);
    }

    @Test void nullReviewActorDoesNotTurnAnOldDecisionIntoSourceVerification() throws Exception {
        reviewed(11, 7, url, "官网完整正文", "DISMISSED", "2026-10-11 13:00:00");
        jdbc.update("UPDATE knowledge_update_candidates SET reviewed_by=NULL");
        fetch(url, "官网完整正文");
        assertThatThrownBy(() -> service.check(7L, 11L)).isInstanceOf(ResponseStatusException.class);
        assertThat(pending(11)).isZero(); assertThat(total()).isEqualTo(1);
    }

    @Test void normalizedLineEndingsMatchReviewedSource() throws Exception {
        reviewed(11, 7, url, "正文一\n正文二", "DISMISSED", "2026-10-11 13:00:00");
        fetch(url, "正文一\r\n正文二\r\n"); service.check(7L, 11L);
        assertThat(total()).isEqualTo(1); assertThat(pending(11)).isZero();
    }

    private void successor(String sourceUrl) throws Exception {
        insertDocument(42, 7, sourceUrl, "新人工整理摘要");
        jdbc.update("UPDATE knowledge_documents SET status='ARCHIVED' WHERE id=11");
        jdbc.update("INSERT INTO knowledge_document_versions VALUES(11,11),(42,11)");
    }
    private void insertDocument(long id, long school, String sourceUrl, String summary) throws Exception {
        jdbc.update("INSERT INTO knowledge_documents VALUES (?,?,'PUBLISHED',?,?)", id, school, sourceUrl, hash(summary));
    }
    private void reviewed(long document, long school, String sourceUrl, String raw, String status, String time) throws Exception {
        jdbc.update("INSERT INTO knowledge_update_candidates(school_id,document_id,source_url,detected_title,detected_content,"
                        + "previous_hash,detected_hash,status,reviewed_by,reviewed_at) VALUES (?,?,?,'官网标题',?,?,?,?,3,?)",
                school, document, sourceUrl, raw, hash("人工整理摘要"), hash(raw), status, Timestamp.valueOf(time));
    }
    private void fetch(String sourceUrl, String raw) {
        when(previews.url(7L, sourceUrl)).thenReturn(new KnowledgeImportPreview("官网标题", raw, sourceUrl, "URL", null, List.of()));
    }
    private int total() { return jdbc.queryForObject("SELECT COUNT(*) FROM knowledge_update_candidates", Integer.class); }
    private int pending(long document) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM knowledge_update_candidates WHERE document_id=? AND status='PENDING'", Integer.class, document);
    }
    private String hash(String text) throws Exception {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8)));
    }
}
