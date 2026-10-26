package com.campusai.material;

import com.zaxxer.hikari.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;

/** Native SQL/transaction correctness only. The large prior files are metadata fixtures, not disk load. */
@Timeout(45) @EnabledIfEnvironmentVariable(named="RUN_PRIVATE_MATERIAL_QUOTA_MYSQL",matches="true")
class PrivateMaterialMysqlQuotaTest {
    @Test void utf8AccountingIdempotencyAndConcurrentCapacityOnNativeMysql() throws Exception {
        String schema=System.getenv("PRIVATE_MATERIAL_QUOTA_MYSQL_SCHEMA");
        assertTrue(schema!=null&&schema.matches("campthink_material_quota_20261020_[a-f0-9]{12}"));
        int port=Integer.parseInt(System.getenv("PRIVATE_MATERIAL_QUOTA_MYSQL_PORT"));assertTrue(port>=1024&&port<=65535);
        var cfg=new HikariConfig();
        cfg.setJdbcUrl("jdbc:mysql://127.0.0.1:"+port+"/"+schema+"?serverTimezone=Asia/Shanghai&characterEncoding=utf8&connectTimeout=2000&socketTimeout=8000");
        cfg.setUsername(System.getenv("PRIVATE_MATERIAL_QUOTA_MYSQL_USER"));cfg.setPassword(System.getenv("PRIVATE_MATERIAL_QUOTA_MYSQL_PASSWORD"));
        cfg.setMaximumPoolSize(4);cfg.setMinimumIdle(1);cfg.setConnectionTimeout(2000);cfg.setPoolName("task-private-material-quota");
        try(var pool=new HikariDataSource(cfg)){
            var db=new JdbcTemplate(pool);db.setQueryTimeout(5);
            assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=?",Integer.class,schema));
            db.execute("CREATE TABLE users(id BIGINT PRIMARY KEY,school_id BIGINT,role VARCHAR(20),status INT)");
            db.update("INSERT INTO users VALUES(1,1,'STUDENT',1),(2,2,'STUDENT',1),(3,1,'STUDENT',1)");
            String schemaSql=new org.springframework.core.io.ClassPathResource("schema.sql").getContentAsString(StandardCharsets.UTF_8);
            String part=schemaSql.substring(schemaSql.indexOf("CREATE TABLE IF NOT EXISTS private_material_quota"),schemaSql.indexOf("CREATE TABLE IF NOT EXISTS student_projects"));
            for(String sql:part.split(";"))if(!sql.isBlank())db.execute(sql);
            Path folder=Files.createTempDirectory(Path.of("../.local/runtime"),"private-material-quota-native-");
            var authBarrier=new java.util.concurrent.atomic.AtomicReference<CountDownLatch>();
            var commands=new MaterialCommandService(db,new ObjectMapper()){
                @Override public Actor actor(Long owner,boolean admin){
                    var actor=super.actor(owner,admin);
                    var gate=authBarrier.get();
                    if(gate!=null&&gate.getCount()>0){
                        gate.countDown();
                        try{if(!gate.await(3,TimeUnit.SECONDS))throw new IllegalStateException("Synthetic authentication barrier timed out");}
                        catch(InterruptedException ex){Thread.currentThread().interrupt();throw new IllegalStateException(ex);}
                    }
                    return actor;
                }
            };
            var service=new PrivateMaterialService(db,commands,folder.toString());
            var attribute=new org.springframework.transaction.annotation.AnnotationTransactionAttributeSource().getTransactionAttribute(
                PrivateMaterialService.class.getMethod("save",Long.class,String.class,org.springframework.web.multipart.MultipartFile.class,String.class),PrivateMaterialService.class);
            assertNotNull(attribute);
            var tx=new TransactionTemplate(new DataSourceTransactionManager(pool),attribute);
            long started=System.nanoTime();String request=UUID.randomUUID().toString();
            var actual=tx.execute(s->{try{return service.save(1L,request,new MockMultipartFile("file","original.txt","text/plain","synthetic".getBytes(StandardCharsets.UTF_8)),"中文😀");}catch(java.io.IOException ex){throw new java.io.UncheckedIOException(ex);}});
            assertNotNull(actual);assertEquals(10,db.queryForObject("SELECT OCTET_LENGTH(extracted_text) FROM private_material_files WHERE id=?",Integer.class,actual.id()));
            assertEquals("中文😀",service.text(1L,actual.id()));
            for(int i=0;i<9;i++)quotaRow(db,1L,PrivateMaterialService.MAX_FILE,"学".repeat(400000));
            assertEquals(409,upload(tx,service,1,1,""));
            var replay=tx.execute(s->{try{return service.save(1L,request,new MockMultipartFile("file","original.txt","text/plain","synthetic".getBytes(StandardCharsets.UTF_8)),"中文😀");}catch(java.io.IOException ex){throw new java.io.UncheckedIOException(ex);}});
            assertEquals(actual.id(),replay.id());
            assertEquals("synthetic",Files.readString(service.download(1L,actual.id()).path()));
            assertEquals(404,assertThrows(ResponseStatusException.class,()->service.download(2L,actual.id())).getStatusCode().value());
            for(int i=0;i<9;i++)quotaRow(db,3L,PrivateMaterialService.MAX_FILE,"");
            quotaRow(db,3L,4L*1024*1024,"");
            // Both real auth SELECTs happen before either quota lock. This
            // reliably reproduces stale REPEATABLE_READ snapshots without
            // replacing authorization results or the quota/write statements.
            authBarrier.set(new CountDownLatch(2));
            var workers=Executors.newFixedThreadPool(2);var ready=new CountDownLatch(1);
            List<Integer> statuses;
            try{
                Callable<Integer> work=()->{ready.await(2,TimeUnit.SECONDS);return upload(tx,service,3,4*1024*1024,"学".repeat(400000));};
                var a=workers.submit(work);var b=workers.submit(work);ready.countDown();
                statuses=new ArrayList<>(List.of(a.get(15,TimeUnit.SECONDS),b.get(15,TimeUnit.SECONDS)));Collections.sort(statuses);
                assertEquals(List.of(200,409),statuses);
            }finally{workers.shutdownNow();authBarrier.set(null);}
            assertEquals(11,service.list(3L,0).total());
            assertTrue(db.queryForObject("SELECT SUM(byte_size+OCTET_LENGTH(extracted_text)) FROM private_material_files WHERE owner_id=3",Long.class)<=PrivateMaterialService.USER_BYTES);
            var result=new LinkedHashMap<String,Object>();
            result.put("engine",db.queryForObject("SELECT VERSION()",String.class));result.put("schema",schema);
            result.put("scope","synthetic loopback native SQL/transactions, not production HTTP/load");
            result.put("utf8BytesForChineseAndEmoji",10);result.put("identicalReceiptRetry",true);
            result.put("wrongOwnerDownloadStatus",404);result.put("concurrentStatuses",statuses);
            result.put("transactionIsolation",attribute.getIsolationLevel());
            result.put("priorLargeOriginals","quota-only metadata, not physical files");
            result.put("syntheticActualFiles",folder.toAbsolutePath().normalize().toString());
            result.put("correctnessRuntimeMillis",(System.nanoTime()-started)/1000000);
            Files.writeString(Path.of("../.local/runtime/late-acceptance-2026-10-20/private-material-quota-mysql.json"),new ObjectMapper().writeValueAsString(result));
            System.out.println("PRIVATE_MATERIAL_QUOTA_MYSQL "+new ObjectMapper().writeValueAsString(result));
        }
    }
    private static int upload(TransactionTemplate tx,PrivateMaterialService service,long owner,int bytes,String text){
        try{
            tx.execute(s->{try{return service.save(owner,UUID.randomUUID().toString(),new MockMultipartFile("file","synthetic.txt","text/plain",new byte[bytes]),text);}catch(java.io.IOException ex){throw new java.io.UncheckedIOException(ex);}});
            return 200;
        }catch(ResponseStatusException ex){return ex.getStatusCode().value();}
    }
    private static void quotaRow(JdbcTemplate db,long owner,long bytes,String text){
        db.update("INSERT INTO private_material_files(id,owner_id,school_id,request_id,name,byte_size,sha256,text_sha256,extracted_text) VALUES(?,?,1,?,'quota-only.txt',?,?,?,?)",
            UUID.randomUUID().toString(),owner,UUID.randomUUID().toString(),bytes,"0".repeat(64),"0".repeat(64),text);
    }
}
