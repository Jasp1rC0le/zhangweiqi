package com.campusai.material;

import com.campusai.canteen.CanteenService;
import com.campusai.exception.GlobalExceptionHandler;
import com.campusai.mapper.*;
import com.campusai.security.*;
import com.campusai.service.*;
import com.campusai.service.impl.KnowledgeSubmissionServiceImpl;
import com.campusai.timetable.*;
import org.junit.jupiter.api.*;
import org.mybatis.spring.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.*;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;
import org.springframework.test.web.servlet.*;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.*;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.mock.web.MockMultipartFile;
import javax.sql.DataSource;
import tools.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.time.LocalDate;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Normal signed JWT and DB session validation; all users and records are synthetic H2. */
@SpringJUnitConfig(MaterialPrivateHttpBoundaryTest.Config.class) @Timeout(20)
class MaterialPrivateHttpBoundaryTest {
    @Configuration @EnableTransactionManagement static class Config {
        @Bean DataSource data(){return new DriverManagerDataSource("jdbc:h2:mem:material_http;MODE=MySQL;DB_CLOSE_DELAY=-1","sa","");}
        @Bean JdbcTemplate db(DataSource data){return new JdbcTemplate(data);}
        @Bean PlatformTransactionManager tx(DataSource data){return new DataSourceTransactionManager(data);}
        @Bean ObjectMapper json(){return new ObjectMapper();}
        @Bean SqlSessionFactoryBean factory(DataSource data){var f=new SqlSessionFactoryBean();f.setDataSource(data);var c=new org.apache.ibatis.session.Configuration();c.setMapUnderscoreToCamelCase(true);f.setConfiguration(c);f.setMapperLocations(new ClassPathResource("mapper/UserMapper.xml"),new ClassPathResource("mapper/KnowledgeSubmissionMapper.xml"));return f;}
        @Bean UserMapper users(org.apache.ibatis.session.SqlSessionFactory f){return new SqlSessionTemplate(f).getMapper(UserMapper.class);}
        @Bean KnowledgeSubmissionMapper submissions(org.apache.ibatis.session.SqlSessionFactory f){return new SqlSessionTemplate(f).getMapper(KnowledgeSubmissionMapper.class);}
        @Bean KnowledgeSubmissionService submissionService(KnowledgeSubmissionMapper mapper,UserMapper users){return new KnowledgeSubmissionServiceImpl(mapper,users,mock(KnowledgeDocumentService.class));}
        @Bean JwtService jwt(){byte[] key=new byte[64];new java.security.SecureRandom().nextBytes(key);return new JwtService(Base64.getEncoder().encodeToString(key),3600000);}
        @Bean AuthSessionService sessions(JdbcTemplate db,UserMapper users,JwtService jwt){return new AuthSessionService(db,users,jwt,30);}
        @Bean MaterialCommandService commands(JdbcTemplate db,ObjectMapper json){return new MaterialCommandService(db,json);}
        @Bean CourseScheduleService schedules(JdbcTemplate db,ObjectMapper json){return new CourseScheduleService(db,json);}
        @Bean PersonalScheduleEditingService edits(CourseScheduleService s,JdbcTemplate db,ObjectMapper json){return new PersonalScheduleEditingService(s,db,json);}
        @Bean PrivateMaterialService originals(JdbcTemplate db,MaterialCommandService commands) throws Exception{return new PrivateMaterialService(db,commands,Files.createTempDirectory("campthink-material-http-").toString());}
        @Bean com.campusai.teaching.TeachingService teaching(){var service=mock(com.campusai.teaching.TeachingService.class);when(service.access(1L)).thenReturn(new com.campusai.teaching.TeachingService.Access(true,List.of("STUDENT")));when(service.access(2L)).thenReturn(new com.campusai.teaching.TeachingService.Access(false,List.of()));return service;}
    }
    @Autowired JdbcTemplate db;@Autowired ObjectMapper json;@Autowired JwtService jwt;@Autowired AuthSessionService sessions;@Autowired UserMapper users;
    @Autowired MaterialCommandService commands;@Autowired KnowledgeSubmissionService submissions;@Autowired CourseScheduleService schedules;@Autowired PersonalScheduleEditingService edits;@Autowired PrivateMaterialService originals;
    @Autowired com.campusai.teaching.TeachingService teaching;
    MockMvc mvc;final Map<Long,String> tokens=new HashMap<>();
    @BeforeEach void setup() throws Exception {
        db.execute("DROP ALL OBJECTS");db.execute("CREATE TABLE users(id BIGINT PRIMARY KEY,school_id BIGINT NOT NULL,role VARCHAR(20),status INT,nickname VARCHAR(100),username VARCHAR(100),password_hash VARCHAR(255),created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)");
        db.update("INSERT INTO users(id,school_id,role,status,nickname,username) VALUES(1,1,'STUDENT',1,'合成甲','synthetic-a'),(2,2,'STUDENT',1,'合成乙','synthetic-b')");
        db.execute("CREATE TABLE auth_sessions(id CHAR(36) PRIMARY KEY,user_id BIGINT,refresh_hash CHAR(64),expires_at TIMESTAMP,revoked_at TIMESTAMP,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)");
        db.execute("CREATE TABLE knowledge_submissions(id BIGINT AUTO_INCREMENT PRIMARY KEY,school_id BIGINT,user_id BIGINT,question VARCHAR(1000),content CLOB,source_url VARCHAR(1000),status VARCHAR(20),review_note VARCHAR(500),reviewed_by BIGINT,reviewed_at TIMESTAMP,knowledge_document_id BIGINT,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)");
        db.execute("CREATE TABLE teaching_classes(id VARCHAR(36),school_id BIGINT,name VARCHAR(100))");db.execute("CREATE TABLE teaching_students(id VARCHAR(36),school_id BIGINT,class_id VARCHAR(36),user_id BIGINT,student_number VARCHAR(40))");db.update("INSERT INTO teaching_classes VALUES('class-a',1,'合成班')");db.update("INSERT INTO teaching_students VALUES('student-a',1,'class-a',1,'SYNTHETIC-001')");
        String schema=new ClassPathResource("schema.sql").getContentAsString(StandardCharsets.UTF_8);
        String part=schema.substring(schema.indexOf("CREATE TABLE IF NOT EXISTS student_course_schedule_versions"),schema.indexOf("CREATE TABLE IF NOT EXISTS student_projects"));
        for(String sql:part.split(";"))if(!sql.isBlank())db.execute(sql);
        mvc=MockMvcBuilders.standaloneSetup(new MaterialCommandController(commands,submissions,new CanteenService(db),mock(ContactMessageService.class)),new PersonalScheduleEditingController(schedules,edits,commands,json),new PrivateMaterialController(originals),new OwnStudentIdentityController(db,commands,teaching))
            .setControllerAdvice(new GlobalExceptionHandler()).addInterceptors(new JwtInterceptor(jwt,sessions)).build();
        tokens.clear();for(long id:List.of(1L,2L))tokens.put(id,sessions.issue(users.findById(id)).accessToken());
    }
    String auth(long user){return "Bearer "+tokens.get(user);}
    @Test void anonymousRequestsAndRevokedSessionsCannotReadAnyPrivateTool() throws Exception {
        for(String route:List.of("/api/material-actions/capabilities","/api/private-materials","/api/timetable/personal-editing","/api/timetable/personal-editing/history"))mvc.perform(get(route)).andExpect(status().isUnauthorized());
        db.update("UPDATE auth_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE user_id=1");mvc.perform(get("/api/private-materials").header("Authorization",auth(1))).andExpect(status().isUnauthorized());
    }
    @Test void knowledgeUsesActualMapperAndReceiptWithSchoolOwnerIsolation() throws Exception {
        String key=UUID.randomUUID().toString(),body=json.writeValueAsString(Map.of("requestId",key,"payload",Map.of("question","合成说明","content","合成正文")));
        var first=mvc.perform(post("/api/material-actions/knowledge").header("Authorization",auth(1)).contentType("application/json").content(body)).andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store")).andExpect(jsonPath("$.result.status").value("PENDING")).andReturn().getResponse().getContentAsString();
        mvc.perform(post("/api/material-actions/knowledge").header("Authorization",auth(1)).contentType("application/json").content(body)).andExpect(status().isOk()).andExpect(content().json(first));
        assertThat(db.queryForObject("SELECT COUNT(*) FROM knowledge_submissions",Integer.class)).isEqualTo(1);
        mvc.perform(get("/api/material-actions/requests/"+key+"?userId=1").header("Authorization",auth(2))).andExpect(status().isNotFound());
        mvc.perform(post("/api/material-actions/merchant").header("Authorization",auth(1)).contentType("application/json").content(json.writeValueAsString(Map.of("requestId",UUID.randomUUID().toString(),"payload",Map.of("canteenId",1,"name","合成商家"))))).andExpect(status().isForbidden());
    }
    @Test void personalChangesRejectFractionalPeriodsUnknownIdentityAndStaleVersions() throws Exception {
        var input=new CourseScheduleService.Input(0,"合成学期",LocalDate.of(2026,9,7),7,List.of(new CourseScheduleService.Course("合成网络",1,null,null,List.of(1),"A",1,2)));
        var body=json.writeValueAsString(new PersonalScheduleEditingController.Request(UUID.randomUUID().toString(),new PersonalScheduleEditingService.Edit(List.of(input),"初次合成保存")));
        mvc.perform(post("/api/timetable/personal-editing").header("Authorization",auth(1)).contentType("application/json").content(body.replace("\"startPeriod\":1","\"startPeriod\":1.5"))).andExpect(status().isBadRequest());
        mvc.perform(post("/api/timetable/personal-editing").header("Authorization",auth(1)).contentType("application/json").content(body.replace("\"name\":","\"userId\":2,\"name\":"))).andExpect(status().isBadRequest());
        mvc.perform(post("/api/timetable/personal-editing").header("Authorization",auth(1)).contentType("application/json").content(body)).andExpect(status().isOk());
        mvc.perform(get("/api/timetable/personal-editing/history/1?userId=1").header("Authorization",auth(2))).andExpect(status().isNotFound());
    }
    @Test void actualMultipartOriginalDownloadsExactBytesButNotForOtherOwner() throws Exception {
        var file=new MockMultipartFile("file","synthetic.txt","text/plain","only synthetic".getBytes(StandardCharsets.UTF_8));
        var result=mvc.perform(multipart("/api/private-materials").file(file).param("requestId",UUID.randomUUID().toString()).param("text","合成正文").header("Authorization",auth(1))).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        String id=json.readTree(result).get("id").asString();
        mvc.perform(get("/api/private-materials/"+id+"/download").header("Authorization",auth(1))).andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store")).andExpect(header().string("X-Content-Type-Options","nosniff")).andExpect(content().bytes(file.getBytes()));
        mvc.perform(get("/api/private-materials/"+id+"/download?owner=1").header("Authorization",auth(2))).andExpect(status().isNotFound());
    }
    @Test void normalSignedUploadRejectsCombinedQuotaAndLeavesOtherOwnerIndependent() throws Exception {
        // Synthetic quota-only prior metadata, not a disk-capacity load test.
        for(int i=0;i<9;i++)db.update("INSERT INTO private_material_files(id,owner_id,school_id,request_id,name,byte_size,sha256,text_sha256,extracted_text) VALUES(?,1,1,?,'quota-only.txt',?,?,?,?)",
            UUID.randomUUID().toString(),UUID.randomUUID().toString(),PrivateMaterialService.MAX_FILE,"0".repeat(64),"0".repeat(64),"学".repeat(400000));
        var file=new MockMultipartFile("file","new.txt","text/plain","synthetic".getBytes(StandardCharsets.UTF_8));
        mvc.perform(multipart("/api/private-materials").file(file).param("requestId",UUID.randomUUID().toString()).header("Authorization",auth(1)))
            .andExpect(status().isConflict()).andExpect(header().string("Cache-Control","no-store"));
        assertThat(db.queryForObject("SELECT COUNT(*) FROM private_material_files WHERE owner_id=1",Integer.class)).isEqualTo(9);
        mvc.perform(multipart("/api/private-materials").file(file).param("requestId",UUID.randomUUID().toString()).header("Authorization",auth(2)))
            .andExpect(status().isOk());
        assertThat(db.queryForObject("SELECT COUNT(*) FROM private_material_files WHERE owner_id=2",Integer.class)).isEqualTo(1);
    }
    @Test void ownStudentNumberUsesTheBoundSessionNotARequestedUserOrName() throws Exception {
        mvc.perform(get("/api/account/student-identity?userId=2&name=other").header("Authorization",auth(1))).andExpect(status().isOk()).andExpect(jsonPath("$.studentNumber").value("SYNTHETIC-001"));
        mvc.perform(get("/api/account/student-identity?userId=1").header("Authorization",auth(2))).andExpect(status().isOk()).andExpect(jsonPath("$.bound").value(false)).andExpect(jsonPath("$.studentNumber").doesNotExist());
        mvc.perform(get("/api/account/student-identity")).andExpect(status().isUnauthorized());
    }
}
