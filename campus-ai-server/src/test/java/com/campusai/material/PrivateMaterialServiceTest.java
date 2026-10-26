package com.campusai.material;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;
import org.springframework.transaction.*;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.mock.web.MockMultipartFile;
import javax.sql.DataSource;
import tools.jackson.databind.ObjectMapper;
import java.nio.file.*;
import java.util.*;
import static org.assertj.core.api.Assertions.*;

@SpringJUnitConfig(PrivateMaterialServiceTest.Config.class) @Timeout(15)
class PrivateMaterialServiceTest {
    static final Path FOLDER=temp();
    static Path temp(){try{return Files.createTempDirectory("campthink-private-material-test-");}catch(java.io.IOException e){throw new IllegalStateException(e);}}
    @Configuration @EnableTransactionManagement static class Config {
        @Bean DataSource data(){return new DriverManagerDataSource("jdbc:h2:mem:private_material;MODE=MySQL;DB_CLOSE_DELAY=-1;LOCK_TIMEOUT=3000","sa","");}
        @Bean JdbcTemplate jdbc(DataSource data){return new JdbcTemplate(data);}
        @Bean PlatformTransactionManager tx(DataSource data){return new DataSourceTransactionManager(data);}
        @Bean MaterialCommandService commands(JdbcTemplate db){return new MaterialCommandService(db,new ObjectMapper());}
        @Bean PrivateMaterialService service(JdbcTemplate db,MaterialCommandService auth){return new PrivateMaterialService(db,auth,FOLDER.toString());}
    }
    @Autowired JdbcTemplate db;@Autowired PrivateMaterialService service;
    @BeforeEach void setup() throws Exception {
        db.execute("DROP ALL OBJECTS");db.execute("CREATE TABLE users(id BIGINT PRIMARY KEY,school_id BIGINT,role VARCHAR(20),status INT)");db.update("INSERT INTO users VALUES(1,1,'STUDENT',1),(2,1,'STUDENT',1)");
        String schema=new org.springframework.core.io.ClassPathResource("schema.sql").getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
        String portion=schema.substring(schema.indexOf("CREATE TABLE IF NOT EXISTS private_material_quota"),schema.indexOf("CREATE TABLE IF NOT EXISTS student_projects"));
        for(var sql:portion.split(";"))if(!sql.isBlank())db.execute(sql);
    }
    MockMultipartFile file(String name,String value){return new MockMultipartFile("file",name,"text/plain",value.getBytes(java.nio.charset.StandardCharsets.UTF_8));}
    @Test void originalAndTextAreOwnerScopedAndRepeatUploadReturnsSameOriginal() throws Exception {
        String id=UUID.randomUUID().toString();var first=service.save(1L,id,file("../sample.txt","synthetic original"),"合成提取文字");
        assertThat(first.name()).isEqualTo("sample.txt");assertThat(service.save(1L,id,file("../sample.txt","synthetic original"),"合成提取文字").id()).isEqualTo(first.id());
        assertThat(Files.readString(service.download(1L,first.id()).path())).isEqualTo("synthetic original");
        assertThat(service.text(1L,first.id())).isEqualTo("合成提取文字");assertThat(service.list(1L,0).total()).isEqualTo(1);
        assertThat(service.list(2L,0).total()).isZero();assertThatThrownBy(()->service.download(2L,first.id())).hasMessageContaining("404");
        assertThatThrownBy(()->service.save(1L,id,file("sample.txt","changed"),"合成提取文字")).hasMessageContaining("409");
    }
    @Test void integrityAndChangedSchoolAreRecheckedBeforeDownload() throws Exception {
        var row=service.save(1L,UUID.randomUUID().toString(),file("sample.txt","original"),"");
        Files.writeString(FOLDER.resolve(row.id()+".bin"),"tampered");
        assertThatThrownBy(()->service.download(1L,row.id())).hasMessageContaining("503");
        db.update("UPDATE users SET school_id=2 WHERE id=1");assertThatThrownBy(()->service.text(1L,row.id())).hasMessageContaining("404");
    }
    @Test void databaseFailureRemovesOnlyTheUncommittedFile() throws Exception {
        var kept=service.save(1L,UUID.randomUUID().toString(),file("keep.txt","keep"),"");
        long before;try(var paths=Files.list(FOLDER)){before=paths.count();}
        db.execute("ALTER TABLE private_material_files ADD CONSTRAINT reject_new_file CHECK(name <> 'bad.txt')");
        assertThatThrownBy(()->service.save(1L,UUID.randomUUID().toString(),file("bad.txt","bad"),"")).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        try(var paths=Files.list(FOLDER)){assertThat(paths.count()).isEqualTo(before);}
        assertThat(service.download(1L,kept.id()).info().name()).isEqualTo("keep.txt");
    }
    @Test void missingSchemaAndInvalidFilesFailBeforeStorage() throws Exception {
        assertThatThrownBy(()->service.save(1L,UUID.randomUUID().toString(),file("app.exe","not allowed"),"")).hasMessageContaining("400");
        db.execute("DROP TABLE private_material_files");assertThat(service.capabilities(1L).privateOriginals()).isFalse();
        assertThatThrownBy(()->service.save(1L,UUID.randomUUID().toString(),file("a.txt","a"),"")).hasMessageContaining("503");
    }
    // Quota metadata fixtures only: the prior large files are not materialized
    // and these tests make no disk-capacity or download-integrity claim for them.
    void quotaRow(long owner,long bytes,String text) {
        db.update("INSERT INTO private_material_files(id,owner_id,school_id,request_id,name,byte_size,sha256,text_sha256,extracted_text) VALUES(?,?,1,?,'quota-only.txt',?,?,?,?)",
            UUID.randomUUID().toString(),owner,UUID.randomUUID().toString(),bytes,"0".repeat(64),"0".repeat(64),text);
    }
    @Test void ownerQuotaIncludesUtf8ExtractedTextAndStillAllowsAnIdenticalReceiptRetry() throws Exception {
        String key=UUID.randomUUID().toString();
        var original=service.save(1L,key,file("kept.txt","kept"),"原文");
        for(int i=0;i<9;i++)quotaRow(1L,PrivateMaterialService.MAX_FILE,"学".repeat(400000));
        assertThat(db.queryForObject("SELECT SUM(byte_size) FROM private_material_files WHERE owner_id=1",Long.class)).isLessThan(PrivateMaterialService.USER_BYTES);
        long before;try(var files=Files.list(FOLDER)){before=files.count();}
        assertThatThrownBy(()->service.save(1L,UUID.randomUUID().toString(),file("new.txt","x"),"")).hasMessageContaining("409");
        assertThat(service.save(1L,key,file("kept.txt","kept"),"原文").id()).isEqualTo(original.id());
        assertThat(Files.readString(service.download(1L,original.id()).path())).isEqualTo("kept");
        assertThat(service.list(1L,0).total()).isEqualTo(10);
        try(var files=Files.list(FOLDER)){assertThat(files.count()).isEqualTo(before);}
    }
    @Test void totalQuotaIncludesOtherOwnersExtractedTextWithoutOverwritingAnything() {
        for(long owner=3;owner<=32;owner++)db.update("INSERT INTO users VALUES(?,1,'STUDENT',1)",owner);
        for(int i=0;i<204;i++)quotaRow(3L+i%30,PrivateMaterialService.MAX_FILE,"x".repeat(45000));
        assertThat(db.queryForObject("SELECT SUM(byte_size) FROM private_material_files",Long.class)).isLessThan(PrivateMaterialService.TOTAL_BYTES);
        assertThatThrownBy(()->service.save(1L,UUID.randomUUID().toString(),file("new.txt","x"),"")).hasMessageContaining("409");
        assertThat(db.queryForObject("SELECT COUNT(*) FROM private_material_files",Integer.class)).isEqualTo(204);
        assertThat(service.list(1L,0).total()).isZero();
    }
    @Test void incomingTextIsCountedInBytesAndTheExactCombinedBoundaryIsAllowed() throws Exception {
        for(int i=0;i<9;i++)quotaRow(1L,PrivateMaterialService.MAX_FILE,"");
        byte[] bytes=new byte[(int)PrivateMaterialService.MAX_FILE-3];Arrays.fill(bytes,(byte)'x');
        var input=new MockMultipartFile("file","exact.txt","text/plain",bytes);
        var exact=service.save(1L,UUID.randomUUID().toString(),input,"学");
        assertThat(exact.bytes()).isEqualTo(bytes.length);
        assertThatThrownBy(()->service.save(1L,UUID.randomUUID().toString(),file("one-more.txt","x"),"")).hasMessageContaining("409");
        assertThat(service.list(1L,0).total()).isEqualTo(10);
    }
    @Test void concurrentUploadsCannotBothSpendTheRemainingCombinedQuota() throws Exception {
        for(int i=0;i<9;i++)quotaRow(1L,PrivateMaterialService.MAX_FILE,"");
        quotaRow(1L,4L*1024*1024,"");
        var pool=java.util.concurrent.Executors.newFixedThreadPool(2);
        var start=new java.util.concurrent.CountDownLatch(1);
        var work=(java.util.concurrent.Callable<Integer>)()->{
            start.await(2,java.util.concurrent.TimeUnit.SECONDS);
            var part=new MockMultipartFile("file","concurrent.txt","text/plain",new byte[4*1024*1024]);
            try{service.save(1L,UUID.randomUUID().toString(),part,"学".repeat(400000));return 200;}
            catch(org.springframework.web.server.ResponseStatusException ex){return ex.getStatusCode().value();}
        };
        try{
            var a=pool.submit(work);var b=pool.submit(work);start.countDown();
            assertThat(List.of(a.get(10,java.util.concurrent.TimeUnit.SECONDS),b.get(10,java.util.concurrent.TimeUnit.SECONDS))).containsExactlyInAnyOrder(200,409);
            assertThat(service.list(1L,0).total()).isEqualTo(11);
            assertThat(db.queryForObject("SELECT SUM(byte_size+OCTET_LENGTH(extracted_text)) FROM private_material_files WHERE owner_id=1",Long.class)).isLessThanOrEqualTo(PrivateMaterialService.USER_BYTES);
        }finally{pool.shutdownNow();}
    }
    @AfterAll static void cleanupOwnTemporaryFiles() throws Exception {
        try(var files=Files.list(FOLDER)){for(Path path:files.toList())Files.deleteIfExists(path);}
        Files.deleteIfExists(FOLDER);
    }
}
