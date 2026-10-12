package com.campusai.service;

import com.campusai.mapper.KnowledgeDocumentMapper;
import org.apache.ibatis.builder.xml.XMLMapperBuilder;
import org.apache.ibatis.mapping.Environment;
import org.apache.ibatis.session.*;
import org.apache.ibatis.transaction.jdbc.JdbcTransactionFactory;
import org.junit.jupiter.api.*;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import static org.assertj.core.api.Assertions.assertThat;

class KnowledgeInventoryPersistenceTest {
    JdbcTemplate jdbc; SqlSession session; KnowledgeDocumentMapper mapper;
    @BeforeEach void setup() throws Exception {
        var source = new DriverManagerDataSource("jdbc:h2:mem:inventory_"+java.util.UUID.randomUUID()+";MODE=MySQL;DB_CLOSE_DELAY=-1", "sa", "");
        jdbc = new JdbcTemplate(source);
        jdbc.execute("create table knowledge_documents(id bigint primary key,school_id bigint,title varchar(100),category varchar(100),source_department varchar(100),source_url varchar(100),published_at timestamp,effective_at timestamp,expires_at timestamp,status varchar(20),content_hash varchar(64),raw_content clob,created_at timestamp,updated_at timestamp)");
        jdbc.execute("create table knowledge_document_versions(document_id bigint primary key,supersedes_document_id bigint,version_number int)");
        for (int id=1; id<=205; id++) jdbc.update("insert into knowledge_documents(id,school_id,title,status,raw_content) values(?,1,?,'PUBLISHED','full text')",id,"doc"+id);
        jdbc.update("insert into knowledge_documents(id,school_id,title,status) values(500,2,'other school','PUBLISHED')");
        var config = new Configuration(new Environment("test",new JdbcTransactionFactory(),source));
        config.setMapUnderscoreToCamelCase(true);
        config.setLocalCacheScope(LocalCacheScope.STATEMENT);
        try(var xml = new ClassPathResource("mapper/KnowledgeDocumentMapper.xml").getInputStream()) {
            new XMLMapperBuilder(xml,config,"mapper/KnowledgeDocumentMapper.xml",config.getSqlFragments()).parse();
        }
        session = new SqlSessionFactoryBuilder().build(config).openSession(true);
        mapper = session.getMapper(KnowledgeDocumentMapper.class);
    }
    @AfterEach void close() { if(session!=null)session.close(); if(jdbc!=null)jdbc.execute("SHUTDOWN"); }
    @Test void scansMoreThanTwoPagesWithoutCrossSchoolLeakOrFullText() {
        var first=mapper.scanBySchoolId(1L,null);
        assertThat(first).hasSize(100);
        assertThat(first.get(0).getId()).isEqualTo(205);
        assertThat(first.get(99).getId()).isEqualTo(106);
        assertThat(first).allSatisfy(doc->{assertThat(doc.getSchoolId()).isEqualTo(1);assertThat(doc.getRawContent()).isNull();});
        assertThat(mapper.scanBySchoolId(1L,106L)).hasSize(100);
        assertThat(mapper.scanBySchoolId(1L,6L)).extracting("id").containsExactly(5L,4L,3L,2L,1L);
        assertThat(mapper.scanBySchoolId(1L,1L)).isEmpty();
        assertThat(mapper.scanBySchoolId(2L,null)).extracting("id").containsExactly(500L);
    }
    @Test void editingOldRecordAndInsertingNewRecordDoesNotMoveTheCursor() {
        mapper.scanBySchoolId(1L,null);
        jdbc.update("update knowledge_documents set updated_at=current_timestamp where id=10");
        jdbc.update("insert into knowledge_documents(id,school_id,title) values(501,1,'new')");
        var next=mapper.scanBySchoolId(1L,106L);
        assertThat(next).hasSize(100);
        assertThat(next).extracting("id").contains(10L).doesNotContain(501L,205L);
    }
    @Test void preservesRevisionMetadata() {
        jdbc.update("insert into knowledge_document_versions values(205,204,2)");
        var page=mapper.scanBySchoolId(1L,null);
        assertThat(page.get(0).getVersionNumber()).isEqualTo(2);
        assertThat(page.get(1).getHasSuccessor()).isTrue();
    }
}
