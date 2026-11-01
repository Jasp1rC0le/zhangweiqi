package com.campusai.controller;

import com.campusai.exception.GlobalExceptionHandler;
import com.campusai.security.*;
import com.campusai.timetable.*;
import io.jsonwebtoken.Claims;
import org.junit.jupiter.api.*;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import java.util.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class CourseImageBatchControllerTest {
    final LocalTimetableOcrService ocr=mock(LocalTimetableOcrService.class);
    final CourseImageImportService importer=mock(CourseImageImportService.class);
    MockMvc mvc;
    static MockMultipartFile image(byte value){return new MockMultipartFile("images","private.png","image/png",new byte[]{value});}
    @BeforeEach void setup(){
        var jwt=mock(JwtService.class);var sessions=mock(AuthSessionService.class);var claims=mock(Claims.class);
        when(claims.getSubject()).thenReturn("7");when(claims.get("role",String.class)).thenReturn("STUDENT");when(claims.get("sid",String.class)).thenReturn("session");
        when(jwt.parseToken("synthetic-token")).thenReturn(claims);when(sessions.active("session",7L,"STUDENT")).thenReturn(true);
        mvc=MockMvcBuilders.standaloneSetup(new TimetableVisionController(ocr,importer,sessions)).setControllerAdvice(new GlobalExceptionHandler()).addInterceptors(new JwtInterceptor(jwt,sessions)).build();
    }
    @Test void normalMultipartUsesSessionOwnerAndNeverAClientSelectedAccount()throws Exception{
        when(importer.importImages(eq(7L),eq(3),anyList(),any())).thenReturn(new CourseImageImportService.BatchResult(null,2,9,List.of(9,10),2,0,true,CampusBellSchedule.VERSION,List.of(),List.of()));
        mvc.perform(multipart("/api/timetable/courses/import-images?revision=3&userId=99").file(image((byte)1)).file(image((byte)2)).header("Authorization","Bearer synthetic-token"))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store")).andExpect(jsonPath("$.weeks[1]").value(10));
        verify(importer).importImages(eq(7L),eq(3),argThat(list->list.size()==2&&list.get(0)[0]==1&&list.get(1)[0]==2),any());
    }
    @Test void anonymousMissingRevisionWrongFormatAndOversizedFilesNeverReachImporter()throws Exception{
        mvc.perform(multipart("/api/timetable/courses/import-images?revision=0").file(image((byte)1))).andExpect(status().isUnauthorized());
        mvc.perform(multipart("/api/timetable/courses/import-images").file(image((byte)1)).header("Authorization","Bearer synthetic-token")).andExpect(status().isBadRequest());
        mvc.perform(multipart("/api/timetable/courses/import-images?revision=0").file(new MockMultipartFile("images","x.gif","image/gif",new byte[]{1})).header("Authorization","Bearer synthetic-token")).andExpect(status().isUnsupportedMediaType());
        mvc.perform(multipart("/api/timetable/courses/import-images?revision=0").file(new MockMultipartFile("images","x.png","image/png",new byte[TimetableService.MAX_IMAGE_BYTES+1])).header("Authorization","Bearer synthetic-token")).andExpect(status().isPayloadTooLarge());
        verifyNoInteractions(importer);
    }
    @Test void tooManyPicturesAndEmptyPartsNeverReachImporter()throws Exception{
        var request=multipart("/api/timetable/courses/import-images?revision=0").header("Authorization","Bearer synthetic-token");for(int i=0;i<21;i++)request.file(image((byte)i));
        mvc.perform(request).andExpect(status().isBadRequest());
        mvc.perform(multipart("/api/timetable/courses/import-images?revision=0").file(new MockMultipartFile("images","x.png","image/png",new byte[0])).header("Authorization","Bearer synthetic-token")).andExpect(status().isBadRequest());
        verifyNoInteractions(importer);
    }
}
