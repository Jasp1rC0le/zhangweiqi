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
import java.time.LocalDateTime;
import static org.assertj.core.api.Assertions.assertThat;

@Timeout(10)
class KnowledgeDatePersistenceTest {
    JdbcTemplate jdbc; SqlSession session; KnowledgeDocumentMapper mapper;
    @BeforeEach void setup() throws Exception {
        var source = new DriverManagerDataSource("jdbc:h2:mem:dates_"+java.util.UUID.randomUUID()+";MODE=MySQL;DB_CLOSE_DELAY=-1", "sa", "");
        jdbc = new JdbcTemplate(source);
        jdbc.execute("create table knowledge_documents(id bigint primary key, school_id bigint, status varchar(20), content_hash varchar(64), published_at timestamp, effective_at timestamp, expires_at timestamp)");
        jdbc.execute("create table knowledge_document_versions(document_id bigint primary key,supersedes_document_id bigint)");
        jdbc.update("insert into knowledge_documents(id,school_id,status,content_hash) values(93,1,'PUBLISHED','abc')");
        var config = new Configuration(new Environment("test",new JdbcTransactionFactory(),source));
        config.setMapUnderscoreToCamelCase(true);
        config.setLocalCacheScope(LocalCacheScope.STATEMENT);
        try(var xml = new ClassPathResource("mapper/KnowledgeDocumentMapper.xml").getInputStream()) {
            new XMLMapperBuilder(xml,config,"mapper/KnowledgeDocumentMapper.xml",config.getSqlFragments()).parse();
        }
        session = new SqlSessionFactoryBuilder().build(config).openSession(true);
        mapper = session.getMapper(KnowledgeDocumentMapper.class);
    }
    @AfterEach void close() { if(session!=null)session.close(); jdbc.execute("SHUTDOWN"); }
    @Test void correctsNullDateWithoutNewDocumentAndRejectsStaleSnapshot() {
        var before=mapper.findByIdAndSchoolId(93L,1L); var after=mapper.findByIdAndSchoolId(93L,1L);
        after.setPublishedAt(LocalDateTime.of(2025,10,13,0,0));
        assertThat(mapper.updateDates(before,after)).isEqualTo(1);
        assertThat(mapper.findByIdAndSchoolId(93L,1L).getPublishedAt()).isEqualTo(after.getPublishedAt());
        assertThat(mapper.updateDates(before,after)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from knowledge_documents",Integer.class)).isEqualTo(1);
    }
    @Test void rejectsOtherSchoolAndArchivedDocument() {
        var before=mapper.findByIdAndSchoolId(93L,1L); var after=mapper.findByIdAndSchoolId(93L,1L);
        before.setSchoolId(2L); assertThat(mapper.updateDates(before,after)).isZero();
        before.setSchoolId(1L); jdbc.update("update knowledge_documents set status='ARCHIVED' where id=93");
        assertThat(mapper.updateDates(before,after)).isZero();
    }
    @Test void rejectsSupersededVersionEvenWithPublishedStatus() {
        var before=mapper.findByIdAndSchoolId(93L,1L);
        jdbc.update("insert into knowledge_document_versions values(100,93)");
        assertThat(mapper.updateDates(before,before)).isZero();
    }
    @Test void lockedLookupMapsTheDocumentAndKeepsSchoolBoundary() {
        var locked = mapper.findLockedByIdAndSchoolId(93L, 1L);
        assertThat(locked.getId()).isEqualTo(93L);
        assertThat(locked.getContentHash()).isEqualTo("abc");
        assertThat(mapper.findLockedByIdAndSchoolId(93L, 2L)).isNull();
    }
}
