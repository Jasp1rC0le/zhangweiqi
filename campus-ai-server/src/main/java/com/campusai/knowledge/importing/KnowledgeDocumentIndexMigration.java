package com.campusai.knowledge.importing;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationStartedEvent;
import org.springframework.context.event.EventListener;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/** Upgrades the original global content-hash index without changing existing rows. */
@Component
@org.springframework.context.annotation.Profile("!prod")
public class KnowledgeDocumentIndexMigration {
    private static final Logger log = LoggerFactory.getLogger(KnowledgeDocumentIndexMigration.class);
    private final JdbcTemplate jdbc;

    public KnowledgeDocumentIndexMigration(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @EventListener(ApplicationStartedEvent.class)
    public void migrate() {
        try {
            if (indexExists("uk_document_content_hash") == 0) return;
            if (indexExists("uk_document_school_hash") == 0) {
                jdbc.execute("ALTER TABLE knowledge_documents "
                        + "ADD UNIQUE INDEX uk_document_school_hash (school_id, content_hash)");
            }
            jdbc.execute("ALTER TABLE knowledge_documents DROP INDEX uk_document_content_hash");
            log.info("已将知识资料哈希唯一约束调整为按学校隔离");
        } catch (DataAccessException exception) {
            // A failed migration must not take the whole site offline. The import
            // seeder will skip conflicting rows and the error remains visible here.
            log.error("知识资料索引迁移失败；请检查数据库 DDL 权限及现有重复数据", exception);
        }
    }

    private int indexExists(String name) {
        Integer count = jdbc.queryForObject("""
                SELECT COUNT(*) FROM information_schema.statistics
                WHERE table_schema = DATABASE()
                  AND table_name = 'knowledge_documents'
                  AND index_name = ?
                """, Integer.class, name);
        return count == null ? 0 : count;
    }
}
