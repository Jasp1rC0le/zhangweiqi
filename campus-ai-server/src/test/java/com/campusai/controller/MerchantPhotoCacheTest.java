package com.campusai.controller;
import com.campusai.canteen.*;
import com.campusai.service.UserService;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.assertj.core.api.Assertions.*;
class MerchantPhotoCacheTest {
 @Test void cachedImagesRevalidateAndHiddenPhotoCannotReturn304()throws Exception{
  var photos=mock(CanteenPhotoService.class);when(photos.publicGalleryPhoto(1L,7L)).thenReturn(new byte[]{1,2,3});
  var mvc=MockMvcBuilders.standaloneSetup(new CanteenController(mock(CanteenService.class),photos,mock(UserService.class),mock(CanteenWriteThrottle.class))).build();
  var result=mvc.perform(get("/api/canteens/merchants/1/photos/7")).andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-cache")).andReturn();
  String tag=result.getResponse().getHeader("ETag");assertThat(tag).hasSize(66);
  mvc.perform(get("/api/canteens/merchants/1/photos/7").header("If-None-Match",tag)).andExpect(status().isNotModified());
  when(photos.publicGalleryPhoto(1L,7L)).thenReturn(null);
  mvc.perform(get("/api/canteens/merchants/1/photos/7").header("If-None-Match",tag)).andExpect(status().isNotFound());
 }
}
