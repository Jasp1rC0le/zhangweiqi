package com.campusai.service;

import com.campusai.mapper.*;
import com.campusai.service.impl.KnowledgeDocumentServiceImpl;
import org.apache.ibatis.builder.xml.XMLMapperBuilder;
import org.apache.ibatis.mapping.Environment;
import org.apache.ibatis.session.*;
import org.apache.ibatis.transaction.jdbc.JdbcTransactionFactory;
import org.junit.jupiter.api.*;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@Timeout(10)
class KnowledgeEditablePagePersistenceTest {
    SqlSession session;JdbcTemplate db;KnowledgeDocumentService service;
    @BeforeEach void setup()throws Exception {
        var ds=new DriverManagerDataSource("jdbc:h2:mem:chat_knowledge_"+UUID.randomUUID()+";MODE=MySQL;DB_CLOSE_DELAY=-1","sa","");db=new JdbcTemplate(ds);
        db.execute("CREATE TABLE knowledge_documents(id BIGINT PRIMARY KEY,school_id BIGINT,title VARCHAR(200),category VARCHAR(50),status VARCHAR(20))");
        db.execute("CREATE TABLE knowledge_document_versions(document_id BIGINT PRIMARY KEY,supersedes_document_id BIGINT)");
        for(int i=1;i<=502;i++)db.update("INSERT INTO knowledge_documents VALUES(?,?,?,?,?)",i,1,"合成资料"+i,"合成校园事务","PUBLISHED");
        db.update("UPDATE knowledge_documents SET title='合成%_!资料' WHERE id=502");
        db.update("INSERT INTO knowledge_documents VALUES(9999,2,'外校不可读资料','事务','PUBLISHED'),(8888,1,'不可复活的旧版','事务','PUBLISHED'),(8889,1,'已下架新版','事务','ARCHIVED')");
        db.update("INSERT INTO knowledge_document_versions VALUES(8889,8888)");
        var config=new Configuration(new Environment("synthetic",new JdbcTransactionFactory(),ds));config.setMapUnderscoreToCamelCase(true);config.setLocalCacheScope(LocalCacheScope.STATEMENT);
        try(var xml=new ClassPathResource("mapper/KnowledgeDocumentMapper.xml").getInputStream()){new XMLMapperBuilder(xml,config,"mapper/KnowledgeDocumentMapper.xml",config.getSqlFragments()).parse();}
        session=new SqlSessionFactoryBuilder().build(config).openSession(true);
        service=new KnowledgeDocumentServiceImpl(session.getMapper(KnowledgeDocumentMapper.class),mock(KnowledgeChunkMapper.class),mock(KnowledgeDocumentEventMapper.class),mock(KnowledgeDocumentVersionMapper.class),mock(ApplicationEventPublisher.class));
    }
    @AfterEach void close(){if(session!=null)session.close();if(db!=null)db.execute("SHUTDOWN");}
    @Test void allCurrentDocumentsAreReachableAndSchoolStatusAndLiteralSearchRemainBounded(){
        Set<Long> ids=new HashSet<>();for(int p=0;p<21;p++){
            var page=service.editablePage(1L,p,25,"");assertEquals(502,page.total());assertEquals(21,page.totalPages());for(var row:page.items())assertTrue(ids.add(row.id()));
        }
        assertEquals(502,ids.size());assertFalse(ids.contains(9999L));assertFalse(ids.contains(8888L));assertFalse(ids.contains(8889L));
        assertEquals(List.of(502L),service.editablePage(1L,0,25,"%_!").items().stream().map(KnowledgeDocumentService.DocumentOption::id).toList());
        assertEquals(0,service.editablePage(1L,0,25,"外校").total());assertEquals(1,service.editablePage(2L,0,25,"").total());
        assertThrows(org.springframework.web.server.ResponseStatusException.class,()->service.editablePage(1L,21,25,""));assertThrows(org.springframework.web.server.ResponseStatusException.class,()->service.editablePage(1L,0,101,""));
    }
}
