package com.campusai.timetable;

import com.campusai.mapper.UserMapper;
import com.campusai.user.entity.User;
import org.junit.jupiter.api.*;
import org.springframework.web.server.ResponseStatusException;
import javax.imageio.ImageIO;
import java.io.ByteArrayOutputStream;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static com.campusai.timetable.LocalOcrEngine.*;

class LocalTimetableOcrServiceTest {
    final LocalOcrEngine engine=mock(LocalOcrEngine.class);final UserMapper users=mock(UserMapper.class);final LocalTimetableOcrService service=new LocalTimetableOcrService(engine,users);
    byte[] picture;
    static User user(long school){var u=new User();u.setId(7L);u.setStatus(1);u.setSchoolId(school);return u;}
    @BeforeEach void setup()throws Exception{
        when(users.findById(7L)).thenReturn(user(1));when(engine.available()).thenReturn(true);when(engine.engine()).thenReturn("synthetic-local");
        when(engine.read(any(),anyLong())).thenReturn(SchoolTimetableImageParserTest.lines());
        when(engine.regions(any(),anyList(),anyLong())).thenAnswer(call->{List<Region> regions=call.getArgument(1);if(regions.size()==1&&!regions.get(0).enhance())return List.of(new RegionText(0,List.of(),null));return List.of(new RegionText(0,List.of(),"合成课程甲 公共教学楼D-101"),new RegionText(1,List.of(),"合成课程乙 体育馆"));});
        var out=new ByteArrayOutputStream();ImageIO.write(SchoolTimetableImageParserTest.image(),"png",out);picture=out.toByteArray();
    }
    @Test void localRecognitionReturnsOnlyUploadedFactsAndNoExternalContract(){
        var result=service.recognize(7,picture);assertEquals(2,result.version());assertEquals("local-ocr",result.provider());assertFalse(result.external());assertEquals(2,result.rows().size());assertEquals("2026-09-07",result.firstMonday());verify(users,times(2)).findById(7L);
    }
    @Test void unavailableEngineAndInvalidAccountRefuseBeforeReadingImage(){
        when(engine.available()).thenReturn(false);assertThrows(ResponseStatusException.class,()->service.recognize(7,picture));verify(engine,never()).read(any(),anyLong());
        when(users.findById(7L)).thenReturn(null);assertThrows(ResponseStatusException.class,()->service.capability(7));
    }
    @Test void changedSchoolDiscardsCompletedResult(){
        when(users.findById(7L)).thenReturn(user(1),user(2));var error=assertThrows(ResponseStatusException.class,()->service.recognize(7,picture));assertEquals(403,error.getStatusCode().value());
    }
    @Test void malformedImagesFailWithoutOcrAndSlotsRemainUsable(){
        assertThrows(ResponseStatusException.class,()->service.recognize(7,new byte[]{1,2,3}));verify(engine,never()).read(any(),anyLong());assertEquals(2,service.recognize(7,picture).rows().size());
    }
    @Test @Timeout(10) void oneLocalCpuJobIsBoundedGloballyAndReleasedAfterCompletion()throws Exception{
        var entered=new CountDownLatch(1);var release=new CountDownLatch(1);when(users.findById(8L)).thenReturn(user(1));
        when(engine.read(any(),anyLong())).thenAnswer(call->{entered.countDown();assertTrue(release.await(5,TimeUnit.SECONDS));return SchoolTimetableImageParserTest.lines();});
        var pool=Executors.newSingleThreadExecutor();
        try{var first=pool.submit(()->service.recognize(7,picture));assertTrue(entered.await(5,TimeUnit.SECONDS));
            assertEquals(429,assertThrows(ResponseStatusException.class,()->service.recognize(7,picture)).getStatusCode().value());
            assertEquals(429,assertThrows(ResponseStatusException.class,()->service.recognize(8,picture)).getStatusCode().value());
            release.countDown();assertEquals(2,first.get(5,TimeUnit.SECONDS).rows().size());assertEquals(2,service.recognize(8,picture).rows().size());
        }finally{release.countDown();pool.shutdownNow();}
    }
}
