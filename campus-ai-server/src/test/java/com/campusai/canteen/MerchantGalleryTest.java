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

class MerchantGalleryTest {
 AnnotationConfigApplicationContext context; JdbcTemplate jdbc; CanteenPhotoService photos;
 @Configuration @EnableTransactionManagement static class Config {
  @Bean DataSource ds(){return new DriverManagerDataSource("jdbc:h2:mem:gallery_"+java.util.UUID.randomUUID()+";MODE=MySQL;DB_CLOSE_DELAY=-1","sa","");}
  @Bean JdbcTemplate jdbc(DataSource ds){return new JdbcTemplate(ds);}
  @Bean PlatformTransactionManager tx(DataSource ds){return new DataSourceTransactionManager(ds);}
  @Bean CanteenService canteens(JdbcTemplate jdbc){return new CanteenService(jdbc);}
  @Bean CanteenPhotoService photos(JdbcTemplate jdbc,CanteenService service){return new CanteenPhotoService(jdbc,service);}
 }
 @BeforeEach void start(){context=new AnnotationConfigApplicationContext(Config.class);jdbc=context.getBean(JdbcTemplate.class);photos=context.getBean(CanteenPhotoService.class);
  jdbc.execute("CREATE TABLE campus_canteens(id BIGINT PRIMARY KEY,school_id BIGINT,name VARCHAR(120),status VARCHAR(20))");
  jdbc.execute("CREATE TABLE campus_canteen_merchants(id BIGINT AUTO_INCREMENT PRIMARY KEY,school_id BIGINT,canteen_id BIGINT,name VARCHAR(120),location VARCHAR(120),description VARCHAR(1000),status VARCHAR(20) DEFAULT 'DRAFT',operating_status VARCHAR(20) DEFAULT 'UNKNOWN',UNIQUE(canteen_id,name))");
  jdbc.execute("CREATE TABLE campus_merchant_photos(merchant_id BIGINT PRIMARY KEY,school_id BIGINT,jpeg_data BLOB)");
  jdbc.execute("CREATE TABLE campus_merchant_photo_gallery(id BIGINT AUTO_INCREMENT PRIMARY KEY,merchant_id BIGINT,school_id BIGINT,jpeg_data BLOB,content_sha256 CHAR(64),UNIQUE(merchant_id,content_sha256))");
  jdbc.update("INSERT INTO campus_canteens VALUES(1,7,'合成食堂','PUBLISHED'),(2,8,'外校食堂','PUBLISHED')");
  jdbc.update("INSERT INTO campus_canteen_merchants(id,school_id,canteen_id,name,status) VALUES(1,7,1,'同一家','PUBLISHED'),(2,8,2,'外校','PUBLISHED')");
 }
 @AfterEach void close(){context.close();}
 MockMultipartFile image(int w,int h)throws Exception{var b=new ByteArrayOutputStream();ImageIO.write(new BufferedImage(w,h,BufferedImage.TYPE_INT_RGB),"png",b);return new MockMultipartFile("files","synthetic.png","image/png",b.toByteArray());}
 @Test void multipleMenusKeepOneMerchantAndDeduplicateContent()throws Exception{
  var a=image(900,300);var b=image(300,900);photos.save(7L,1L,a);
  var list=photos.append(7L,1L,List.of(a,b,b));assertThat(list).hasSize(2);assertThat(list.get(0).id()).isZero();
  assertThat(photos.append(7L,1L,List.of(b))).hasSize(2);
  assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM campus_canteen_merchants",Integer.class)).isEqualTo(2);
  var portrait=ImageIO.read(new ByteArrayInputStream(photos.publicGalleryPhoto(1L,list.get(1).id())));assertThat(portrait.getHeight()).isEqualTo(900);assertThat(portrait.getWidth()).isEqualTo(300);
 }
 @Test void badLastPhotoCannotPartiallyAppend()throws Exception{
  assertThatThrownBy(()->photos.append(7L,1L,List.of(image(80,100),new MockMultipartFile("files","fake.png","image/png",new byte[]{1})))).hasMessageContaining("400");
  assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM campus_merchant_photos",Integer.class)).isZero();assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM campus_merchant_photo_gallery",Integer.class)).isZero();
 }
 @Test void foreignAndHiddenMerchantsCannotExposeGallery()throws Exception{
  assertThatThrownBy(()->photos.append(7L,2L,List.of(image(20,20)))).hasMessageContaining("404");
  var ids=photos.append(7L,1L,List.of(image(20,20),image(40,20)));var extra=ids.get(1).id();
  assertThat(photos.publicGalleryPhoto(2L,extra)).isNull();jdbc.update("UPDATE campus_canteens SET status='ARCHIVED' WHERE id=1");
  assertThat(photos.publicGalleryPhoto(1L,extra)).isNull();assertThatThrownBy(()->photos.photoList(7L,1L,true)).hasMessageContaining("404");
 }
 @Test void menuResolutionAndCapacityAreBounded()throws Exception{
  byte[] data=CanteenPhotoService.normalize(image(3600,900).getBytes());var read=ImageIO.read(new ByteArrayInputStream(data));assertThat(read.getWidth()).isEqualTo(2400);assertThat(read.getHeight()).isEqualTo(600);
  for(int i=1;i<=10;i++)photos.append(7L,1L,List.of(image(i+10,20)));
  assertThatThrownBy(()->photos.append(7L,1L,List.of(image(100,200)))).hasMessageContaining("400");assertThat(photos.photoList(7L,1L,true)).hasSize(10);
 }
 @Test void listPreviewIsSmallAndCannotOutliveVisibility()throws Exception{
  photos.save(7L,1L,image(3600,900));var preview=photos.publicPreview(1L);
  var decoded=ImageIO.read(new ByteArrayInputStream(preview));assertThat(decoded.getWidth()).isEqualTo(720);assertThat(decoded.getHeight()).isEqualTo(180);
  assertThat(photos.publicPreview(1L)).isEqualTo(preview);
  jdbc.update("UPDATE campus_canteen_merchants SET status='ARCHIVED' WHERE id=1");assertThat(photos.publicPreview(1L)).isNull();
 }
 @Test void replacingCoverCannotBypassCapacityAfterDuplicateCoverSelection()throws Exception{
  var inputs=new java.util.ArrayList<org.springframework.web.multipart.MultipartFile>();for(int i=0;i<10;i++)inputs.add(image(20+i,30));
  photos.append(7L,1L,inputs);photos.save(7L,1L,inputs.get(1));assertThat(photos.photoList(7L,1L,true)).hasSize(9);
  photos.append(7L,1L,List.of(image(60,90)));byte[] cover=photos.publicPhoto(1L);
  assertThatThrownBy(()->photos.save(7L,1L,image(90,60))).hasMessageContaining("10张");
  assertThat(photos.publicPhoto(1L)).isEqualTo(cover);assertThat(photos.photoList(7L,1L,true)).hasSize(10);
 }
}
