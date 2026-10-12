package com.campusai.service;

import com.campusai.contact.entity.ContactMessage;
import com.campusai.mapper.ContactMessageMapper;
import org.apache.ibatis.builder.xml.XMLMapperBuilder;
import org.apache.ibatis.mapping.Environment;
import org.apache.ibatis.session.Configuration;
import org.apache.ibatis.session.SqlSessionFactoryBuilder;
import org.apache.ibatis.transaction.jdbc.JdbcTransactionFactory;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import static org.assertj.core.api.Assertions.*;

class ContactPrivacyPersistenceTest {
    @Test void realMapperPersistsOwnerAndRestrictsAdminSchool() throws Exception {
        var source=new DriverManagerDataSource("jdbc:h2:mem:contactprivacy;MODE=MySQL;DB_CLOSE_DELAY=-1","sa","");
        var jdbc=new JdbcTemplate(source);
        jdbc.execute("DROP ALL OBJECTS");
        jdbc.execute("CREATE TABLE contact_messages(id BIGINT AUTO_INCREMENT PRIMARY KEY,user_id BIGINT,school_id BIGINT,name VARCHAR(80),contact VARCHAR(120),subject VARCHAR(120),message TEXT,status VARCHAR(20),created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)");
        var config=new Configuration(new Environment("test",new JdbcTransactionFactory(),source));
        config.setMapUnderscoreToCamelCase(true);
        try(var xml=new ClassPathResource("mapper/ContactMessageMapper.xml").getInputStream()) {
            new XMLMapperBuilder(xml,config,"mapper/ContactMessageMapper.xml",config.getSqlFragments()).parse();
        }
        try(var session=new SqlSessionFactoryBuilder().build(config).openSession(true)) {
            var mapper=session.getMapper(ContactMessageMapper.class);
            var own=entry(7L,1L);var other=entry(8L,2L);
            mapper.insert(own);mapper.insert(other);
            assertThat(mapper.findById(own.getId()).getUserId()).isEqualTo(7L);
            assertThat(mapper.findAll(1L)).extracting(ContactMessage::getId).containsExactly(own.getId());
            assertThat(mapper.markHandled(other.getId(),1L)).isZero();
            assertThat(mapper.findById(other.getId()).getStatus()).isEqualTo("NEW");
            assertThat(mapper.markHandled(own.getId(),1L)).isEqualTo(1);
            jdbc.update("DELETE FROM contact_messages WHERE user_id=?",7L);
            assertThat(mapper.findAll(1L)).isEmpty();
            assertThat(mapper.findAll(2L)).hasSize(1);
        }
    }
    private ContactMessage entry(Long user,Long school) {
        var row=new ContactMessage();row.setUserId(user);row.setSchoolId(school);row.setName("同学");
        row.setContact("主动提供的联系方式");row.setSubject("建议");row.setMessage("正文");row.setStatus("NEW");return row;
    }
}
