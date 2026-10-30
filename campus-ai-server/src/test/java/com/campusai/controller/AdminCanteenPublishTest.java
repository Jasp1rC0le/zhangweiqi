package com.campusai.controller;
import com.campusai.canteen.*;
import com.campusai.service.UserService;
import com.campusai.user.entity.User;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.mock.web.MockPart;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import java.util.List;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
class AdminCanteenPublishTest {
 final CanteenService service=mock(CanteenService.class); final CanteenPhotoService photos=mock(CanteenPhotoService.class); final UserService users=mock(UserService.class);
 org.springframework.test.web.servlet.request.MockMultipartHttpServletRequestBuilder request(){
  var metadata=new MockPart("items","[{\"canteenId\":2,\"name\":\"合成店\",\"location\":\"二楼\"}]".getBytes(java.nio.charset.StandardCharsets.UTF_8));metadata.getHeaders().setContentType(MediaType.APPLICATION_JSON);
  return multipart("/api/admin/canteens/merchants/publish").file(new MockMultipartFile("files","photo.png","image/png",new byte[]{1})).part(metadata);
 }
 @Test void multipartListUsesFreshAdministratorSchool()throws Exception{
  User u=new User();u.setRole("ADMIN");u.setStatus(1);u.setSchoolId(12L);when(users.getById(7L)).thenReturn(u);
  when(photos.publish(eq(12L),anyList(),anyList())).thenReturn(List.of());
  var mvc=MockMvcBuilders.standaloneSetup(new AdminCanteenController(service,photos,users)).build();
  mvc.perform(request().requestAttr("currentUserId",7L).requestAttr("currentUserRole","ADMIN")).andExpect(status().isOk());
  verify(photos).publish(eq(12L),argThat(rows->rows.size()==1&&rows.get(0).name().equals("合成店")&&rows.get(0).canteenId().equals(2L)),argThat(files->files.size()==1&&files.get(0).getOriginalFilename().equals("photo.png")));
 }
 @Test void databaseRoleRevocationRejectsBatchBeforePublication()throws Exception{
  User u=new User();u.setRole("STUDENT");u.setStatus(1);u.setSchoolId(12L);when(users.getById(7L)).thenReturn(u);
  var mvc=MockMvcBuilders.standaloneSetup(new AdminCanteenController(service,photos,users)).build();
  mvc.perform(request().requestAttr("currentUserId",7L).requestAttr("currentUserRole","ADMIN")).andExpect(status().isForbidden());verifyNoInteractions(photos,service);
 }
}
