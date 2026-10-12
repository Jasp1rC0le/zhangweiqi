package com.campusai.service;

import com.campusai.mapper.KnowledgeDocumentMapper;
import org.apache.ibatis.builder.xml.XMLMapperBuilder;
import org.apache.ibatis.mapping.Environment;
import org.apache.ibatis.session.Configuration;
import org.apache.ibatis.session.SqlSession;
import org.apache.ibatis.session.SqlSessionFactoryBuilder;
import org.apache.ibatis.transaction.jdbc.JdbcTransactionFactory;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import static org.assertj.core.api.Assertions.assertThat;

class KnowledgeEvaluationVersionPersistenceTest {
    JdbcTemplate jdbc;
    SqlSession session;
    KnowledgeDocumentMapper mapper;

    @BeforeEach void setup() throws Exception {
        var source = new DriverManagerDataSource("jdbc:h2:mem:evaluation_" + java.util.UUID.randomUUID() + ";MODE=MySQL", "sa", "");
        // Keep this isolated in-memory database alive through mapper connection changes.
        source.setUrl(source.getUrl() + ";DB_CLOSE_DELAY=-1");
        jdbc = new JdbcTemplate(source);
        jdbc.execute("create table knowledge_documents(id bigint primary key, school_id bigint, status varchar(20), effective_at timestamp, expires_at timestamp)");
        jdbc.execute("create table knowledge_document_versions(document_id bigint primary key, root_document_id bigint, version_number int, supersedes_document_id bigint)");
        var config = new Configuration(new Environment("test", new JdbcTransactionFactory(), source));
        config.setMapUnderscoreToCamelCase(true);
        config.setLocalCacheScope(org.apache.ibatis.session.LocalCacheScope.STATEMENT);
        try (var xml = new ClassPathResource("mapper/KnowledgeDocumentMapper.xml").getInputStream()) {
            new XMLMapperBuilder(xml, config, "mapper/KnowledgeDocumentMapper.xml", config.getSqlFragments()).parse();
        }
        session = new SqlSessionFactoryBuilder().build(config).openSession(true);
        mapper = session.getMapper(KnowledgeDocumentMapper.class);
    }

    @AfterEach void close() { if (session != null) session.close(); jdbc.execute("SHUTDOWN"); }

    @Test void followsMultipleRevisionsFromRootAndIntermediateWithoutChangingHistory() {
        doc(54, 1, "ARCHIVED"); doc(64, 1, "ARCHIVED"); doc(70, 1, "PUBLISHED");
        version(54,54,1,null); version(64,54,2,54L); version(70,54,3,64L);
        assertThat(mapper.findCurrentEvaluationTarget(54L,1L).getId()).isEqualTo(70L);
        assertThat(mapper.findCurrentEvaluationTarget(64L,1L).getId()).isEqualTo(70L);
        assertThat(mapper.findCurrentEvaluationTarget(70L,1L).getId()).isEqualTo(70L);
        assertThat(jdbc.queryForObject("select status from knowledge_documents where id=54",String.class)).isEqualTo("ARCHIVED");
    }

    @Test void oldUnversionedPublishedDocumentStillWorks() {
        doc(3,1,"PUBLISHED");
        assertThat(mapper.findCurrentEvaluationTarget(3L,1L).getId()).isEqualTo(3L);
        assertThat(mapper.findCurrentEvaluationTarget(99L,1L)).isNull();
    }

    @Test void neverFallsBackToOldPublishedRowWhenSuccessorWithdrawn() {
        doc(54,1,"PUBLISHED"); doc(64,1,"UNPUBLISHED");
        version(54,54,1,null); version(64,54,2,54L);
        assertThat(mapper.findCurrentEvaluationTarget(54L,1L)).isNull();
    }

    @Test void rejectsExpiredAndFutureEffectiveLatestRevision() {
        doc(54,1,"ARCHIVED"); doc(64,1,"PUBLISHED");
        version(54,54,1,null); version(64,54,2,54L);
        jdbc.update("update knowledge_documents set expires_at=timestamp '2000-01-01 00:00:00' where id=64");
        assertThat(mapper.findCurrentEvaluationTarget(54L,1L)).isNull();
        jdbc.update("update knowledge_documents set expires_at=null,effective_at=timestamp '2099-01-01 00:00:00' where id=64");
        assertThat(mapper.findCurrentEvaluationTarget(54L,1L)).isNull();
    }

    @Test void rejectsCrossSchoolOriginalAndCorruptCrossSchoolSuccessor() {
        doc(54,1,"ARCHIVED"); doc(64,2,"PUBLISHED");
        version(54,54,1,null); version(64,54,2,54L);
        assertThat(mapper.findCurrentEvaluationTarget(54L,2L)).isNull();
        assertThat(mapper.findCurrentEvaluationTarget(54L,1L)).isNull();
    }

    @Test void unrelatedDocumentCannotReplaceWithdrawnGold() {
        doc(54,1,"ARCHIVED"); doc(88,1,"PUBLISHED");
        version(54,54,1,null); version(88,88,1,null);
        assertThat(mapper.findCurrentEvaluationTarget(54L,1L)).isNull();
    }

    private void doc(long id,long school,String status) {
        jdbc.update("insert into knowledge_documents(id,school_id,status) values(?,?,?)",id,school,status);
    }
    private void version(long id,long root,int number,Long previous) {
        jdbc.update("insert into knowledge_document_versions values(?,?,?,?)",id,root,number,previous);
    }
}
