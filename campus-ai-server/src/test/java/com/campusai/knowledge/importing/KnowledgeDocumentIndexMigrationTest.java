package com.campusai.knowledge.importing;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

class KnowledgeDocumentIndexMigrationTest {
    @Test
    void addsSchoolScopedIndexBeforeDroppingLegacyIndex() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForObject(anyString(), eq(Integer.class), eq("uk_document_content_hash")))
                .thenReturn(1);
        when(jdbc.queryForObject(anyString(), eq(Integer.class), eq("uk_document_school_hash")))
                .thenReturn(0);

        new KnowledgeDocumentIndexMigration(jdbc).migrate();

        var ordered = inOrder(jdbc);
        ordered.verify(jdbc).execute("ALTER TABLE knowledge_documents "
                + "ADD UNIQUE INDEX uk_document_school_hash (school_id, content_hash)");
        ordered.verify(jdbc).execute("ALTER TABLE knowledge_documents DROP INDEX uk_document_content_hash");
    }

    @Test
    void freshSchemaNeedsNoMigration() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForObject(anyString(), eq(Integer.class), eq("uk_document_content_hash")))
                .thenReturn(0);

        new KnowledgeDocumentIndexMigration(jdbc).migrate();

        verify(jdbc, never()).execute(anyString());
    }
}
