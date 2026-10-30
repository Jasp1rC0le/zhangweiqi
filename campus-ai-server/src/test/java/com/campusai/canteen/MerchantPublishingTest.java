package com.campusai.canteen;
import org.junit.jupiter.api.*;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.mock.web.MockMultipartFile;
import javax.sql.DataSource;
import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.*;
import java.util.List;
import static org.assertj.core.api.Assertions.*;
class MerchantPublishingTest {
 AnnotationConfigApplicationContext context; JdbcTemplate jdbc; CanteenPhotoService photos;
 @Configuration @EnableTransactionManagement static class Config {
  @Bean DataSource ds(){return new DriverManagerDataSource("jdbc:h2:mem:publish_"+java.util.UUID.randomUUID()+";MODE=MySQL;DB_CLOSE_DELAY=-1","sa","");}
  @Bean JdbcTemplate jdbc(DataSource ds){return new JdbcTemplate(ds);}
  @Bean PlatformTransactionManager tx(DataSource ds){return new DataSourceTransactionManager(ds);}
  @Bean CanteenService canteens(JdbcTemplate jdbc){return new CanteenService(jdbc);}
  @Bean CanteenPhotoService photos(JdbcTemplate jdbc,CanteenService service){return new CanteenPhotoService(jdbc,service);}
 }
 @BeforeEach void start(){context=new AnnotationConfigApplicationContext(Config.class);jdbc=context.getBean(JdbcTemplate.class);photos=context.getBean(CanteenPhotoService.class);
  jdbc.execute("CREATE TABLE campus_canteens(id BIGINT PRIMARY KEY,school_id BIGINT,name VARCHAR(120),status VARCHAR(20))");
  jdbc.execute("CREATE TABLE campus_canteen_merchants(id BIGINT AUTO_INCREMENT PRIMARY KEY,school_id BIGINT,canteen_id BIGINT,name VARCHAR(120),location VARCHAR(120),description VARCHAR(1000),status VARCHAR(20) DEFAULT 'DRAFT',operating_status VARCHAR(20) DEFAULT 'UNKNOWN',UNIQUE(canteen_id,name))");
  jdbc.execute("CREATE TABLE campus_merchant_photos(merchant_id BIGINT PRIMARY KEY,school_id BIGINT,jpeg_data BLOB)");
  jdbc.update("INSERT INTO campus_canteens VALUES(1,7,'合成食堂','PUBLISHED'),(2,8,'外校食堂','PUBLISHED'),(3,7,'未发布食堂','DRAFT')");}
 @AfterEach void close(){context.close();}
 MockMultipartFile image(int w,int h)throws Exception{var b=new ByteArrayOutputStream();ImageIO.write(new BufferedImage(w,h,BufferedImage.TYPE_INT_RGB),"png",b);return new MockMultipartFile("files","synthetic.png","image/png",b.toByteArray());}
 CanteenPhotoService.PublishInput row(Long c,String n){return new CanteenPhotoService.PublishInput(c,n,"二楼");}
 @Test void atomicPublicationPreservesLandscapeAndPortraitPhotos()throws Exception{
  var result=photos.publish(7L,List.of(row(1L,"横图店"),row(1L,"竖图店")),List.of(image(900,300),image(300,900)));
  assertThat(result).hasSize(2).allMatch(r->r.status().equals("PUBLISHED")&&r.location().equals("二楼"));
  for(int i=0;i<2;i++){var p=ImageIO.read(new ByteArrayInputStream(jdbc.queryForObject("SELECT jpeg_data FROM campus_merchant_photos WHERE merchant_id=?",byte[].class,result.get(i).id())));assertThat(p.getWidth()).isEqualTo(i==0?900:300);assertThat(p.getHeight()).isEqualTo(i==0?300:900);}
 }
 @Test void invalidLastPhotoCannotLeavePartialMerchants()throws Exception{
  assertThatThrownBy(()->photos.publish(7L,List.of(row(1L,"正常"),row(1L,"坏图")),List.of(image(20,20),new MockMultipartFile("files","fake.png","image/png",new byte[]{1,2,3})))).hasMessageContaining("400");
  assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM campus_canteen_merchants",Integer.class)).isZero();
 }
 @Test void databaseConflictRollsBackEarlierMerchantAndPhoto()throws Exception{
  jdbc.update("INSERT INTO campus_canteen_merchants(school_id,canteen_id,name,status) VALUES(7,1,'已有店','PUBLISHED')");
  assertThatThrownBy(()->photos.publish(7L,List.of(row(1L,"第一家"),row(1L,"已有店")),List.of(image(20,20),image(20,20)))).hasMessageContaining("409");
  assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM campus_canteen_merchants",Integer.class)).isEqualTo(1);assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM campus_merchant_photos",Integer.class)).isZero();
 }
 @Test void foreignDraftAndMissingMetadataCannotPublish()throws Exception{
  for(var i:List.of(row(2L,"外校"),row(3L,"草稿"),new CanteenPhotoService.PublishInput(1L,"","位置")))assertThatThrownBy(()->photos.publish(7L,List.of(i),List.of(image(20,20)))).isInstanceOf(RuntimeException.class);
  assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM campus_canteen_merchants",Integer.class)).isZero();
 }
}
