package com.campusai.operations;
import com.campusai.canteen.*;
import org.junit.jupiter.api.*;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.mock.web.MockMultipartFile;
import javax.sql.DataSource;
import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.*;
import java.util.List;
import static org.assertj.core.api.Assertions.*;
class MerchantPhotoImportTest {
 AnnotationConfigApplicationContext c;JdbcTemplate j;TransactionTemplate tx;
 @Configuration @EnableTransactionManagement static class Config {
  @Bean DataSource ds(){return new DriverManagerDataSource("jdbc:h2:mem:operator_"+java.util.UUID.randomUUID()+";MODE=MySQL;DB_CLOSE_DELAY=-1","sa","");}
  @Bean JdbcTemplate jdbc(DataSource d){return new JdbcTemplate(d);}
  @Bean PlatformTransactionManager tx(DataSource d){return new DataSourceTransactionManager(d);}
  @Bean CanteenService canteens(JdbcTemplate j){return new CanteenService(j);}
  @Bean CanteenPhotoService photos(JdbcTemplate j,CanteenService s){return new CanteenPhotoService(j,s);}
 }
 @BeforeEach void start(){c=new AnnotationConfigApplicationContext(Config.class);j=c.getBean(JdbcTemplate.class);tx=new TransactionTemplate(c.getBean(PlatformTransactionManager.class));
 j.execute("CREATE TABLE schools(id BIGINT PRIMARY KEY,name VARCHAR(120),status INT)");j.execute("CREATE TABLE campus_canteens(id BIGINT PRIMARY KEY,school_id BIGINT,name VARCHAR(120),status VARCHAR(20))");
 j.execute("CREATE TABLE campus_canteen_merchants(id BIGINT AUTO_INCREMENT PRIMARY KEY,school_id BIGINT,canteen_id BIGINT,name VARCHAR(120),location VARCHAR(120),description VARCHAR(1000),status VARCHAR(20) DEFAULT 'DRAFT',operating_status VARCHAR(20) DEFAULT 'UNKNOWN',UNIQUE(canteen_id,name))");
 j.execute("CREATE TABLE campus_merchant_photos(merchant_id BIGINT PRIMARY KEY,school_id BIGINT,jpeg_data BLOB)");j.execute("CREATE TABLE campus_merchant_photo_gallery(id BIGINT AUTO_INCREMENT PRIMARY KEY,merchant_id BIGINT,school_id BIGINT,jpeg_data BLOB,content_sha256 CHAR(64),UNIQUE(merchant_id,content_sha256))");
 j.update("INSERT INTO schools VALUES(7,'合成学校',1)");j.update("INSERT INTO campus_canteens VALUES(1,7,'大食堂','PUBLISHED')");j.update("INSERT INTO campus_canteen_merchants(id,school_id,canteen_id,name,location,status) VALUES(1,7,1,'已有','二楼','PUBLISHED')");}
 @AfterEach void close(){c.close();}
 MockMultipartFile photo()throws Exception{var b=new ByteArrayOutputStream();ImageIO.write(new BufferedImage(80,30,BufferedImage.TYPE_INT_RGB),"png",b);return new MockMultipartFile("files","test.png","image/png",b.toByteArray());}
 MerchantPhotoImport.Entry entry(String name,Long id,String expected)throws Exception{return new MerchantPhotoImport.Entry(name,"大食堂二楼","",id,expected,List.of(photo()));}
 Object run(List<MerchantPhotoImport.Entry> entries,boolean apply){return tx.execute(s->MerchantPhotoImport.execute(new MerchantPhotoImport.Plan("合成学校","大食堂",entries),j,c.getBean(CanteenService.class),c.getBean(CanteenPhotoService.class),apply));}
 @Test void checkModeDoesNotWriteAndApplyKeepsExistingIdentity()throws Exception{var entries=List.of(entry("已有",1L,"已有"),entry("新店",null,null));run(entries,false);assertThat(j.queryForObject("SELECT COUNT(*) FROM campus_canteen_merchants",Integer.class)).isEqualTo(1);run(entries,true);assertThat(j.queryForObject("SELECT location FROM campus_canteen_merchants WHERE id=1",String.class)).isEqualTo("大食堂二楼");assertThat(j.queryForObject("SELECT COUNT(*) FROM campus_canteen_merchants WHERE status='PUBLISHED'",Integer.class)).isEqualTo(2);}
 @Test void changedExpectedMerchantRejectsWholePlanBeforeWrites()throws Exception{assertThatThrownBy(()->run(List.of(entry("第一家",null,null),entry("已有",1L,"已被修改")),true)).hasMessageContaining("reviewed plan");assertThat(j.queryForObject("SELECT COUNT(*) FROM campus_canteen_merchants",Integer.class)).isEqualTo(1);}
 @Test void lastBadPhotoRollsBackEarlierMetadataAndCover()throws Exception{var invalid=new MerchantPhotoImport.Entry("坏图","二楼","",null,null,List.of(new MockMultipartFile("files","x.jpg","image/jpeg",new byte[]{1})));assertThatThrownBy(()->run(List.of(entry("已有",1L,"已有"),entry("第一家",null,null),invalid),true)).hasMessageContaining("400");assertThat(j.queryForObject("SELECT COUNT(*) FROM campus_canteen_merchants",Integer.class)).isEqualTo(1);assertThat(j.queryForObject("SELECT COUNT(*) FROM campus_merchant_photos",Integer.class)).isZero();assertThat(j.queryForObject("SELECT location FROM campus_canteen_merchants WHERE id=1",String.class)).isEqualTo("二楼");}
}
