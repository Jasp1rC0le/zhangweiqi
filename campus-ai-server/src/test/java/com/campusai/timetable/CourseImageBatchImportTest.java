package com.campusai.timetable;

import com.campusai.mapper.UserMapper;
import com.campusai.user.entity.User;
import org.junit.jupiter.api.*;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import java.time.*;
import java.util.*;
import static com.campusai.timetable.CourseScheduleService.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class CourseImageBatchImportTest {
    final LocalTimetableOcrService ocr=mock(LocalTimetableOcrService.class);
    final CourseScheduleService schedules=mock(CourseScheduleService.class);
    final UserMapper users=mock(UserMapper.class);
    final CourseImageImportService service=new CourseImageImportService(ocr,schedules,users,1);
    final List<byte[]> images=List.of(new byte[]{1},new byte[]{2});
    static User user(long school){var u=new User();u.setId(7L);u.setStatus(1);u.setSchoolId(school);return u;}
    static SchoolTimetableImageParser.Row row(int week,String name,int first,int last){return new SchoolTimetableImageParser.Row(name,1,null,null,first,last,List.of(week),"合成教室","","");}
    static LocalTimetableOcrService.Result page(int week,SchoolTimetableImageParser.Row... rows){return new LocalTimetableOcrService.Result(2,"local-ocr","synthetic",false,"合成学期","2026-09-07",week,LocalDate.of(2026,9,7).plusWeeks(week-1).toString(),List.of(rows),List.of());}
    static Snapshot snapshot(int revision,List<Course> courses){return new Snapshot(revision,"合成学期",LocalDate.of(2026,9,7),7,courses,Instant.EPOCH,Instant.EPOCH);}
    @BeforeEach void setup(){
        when(users.findById(7L)).thenReturn(user(1));when(schedules.get(7L)).thenReturn(new State(null));
        when(ocr.recognizeBatch(eq(7L),anyList())).thenReturn(List.of(page(9,row(9,"合成课程",9,10)),page(10,row(10,"合成课程",9,10))));
        when(schedules.saveImported(eq(7L),any(),eq(1L),any())).thenAnswer(call->{Input input=call.getArgument(1);return new State(new Snapshot(input.revision()+1,input.semester(),input.firstMonday(),input.remindDays(),CourseScheduleService.validate(input),Instant.EPOCH,Instant.EPOCH));});
    }
    @Test void differentWeeksMergeIntoOneVersionAndPreserveUntouchedWeeks(){
        var old=new Course("原课程",3,null,null,List.of(8,9,11),"合成教室",3,4,"原教师");when(schedules.get(7L)).thenReturn(new State(snapshot(4,List.of(old))));
        var result=service.importImages(7,4,images);
        assertEquals(List.of(9,10),result.weeks());assertEquals(2,result.importedRows());assertEquals(5,result.schedule().revision());
        assertEquals(List.of(8,11),result.schedule().courses().stream().filter(c->c.name().equals("原课程")).findFirst().orElseThrow().weeks());
        assertEquals(List.of(9,10),result.schedule().courses().stream().filter(c->c.name().equals("合成课程")).findFirst().orElseThrow().weeks());
        assertEquals("18:20",result.recognized().get(0).startTime());assertEquals("19:55",result.recognized().get(0).endTime());
        verify(schedules,times(1)).saveImported(eq(7L),argThat(i->i.revision()==4),eq(1L),any());
    }
    @Test void identicalImageBytesAreRemovedBeforeCpuRecognition(){
        var result=service.importImages(7,0,List.of(images.get(0),new byte[]{1},images.get(1)));
        assertEquals(2,result.imageCount());assertEquals(1,result.duplicateImages());
        verify(ocr).recognizeBatch(eq(7L),argThat(list->list.size()==2&&Arrays.equals(list.get(0),new byte[]{1})&&Arrays.equals(list.get(1),new byte[]{2})));
    }
    @Test void sameWeekExactCoursesDeduplicateButDifferentNamesAtSameTimeRefuseTheWholeBatch(){
        when(ocr.recognizeBatch(eq(7L),anyList())).thenReturn(List.of(page(9,row(9,"相同课程",1,2)),page(9,row(9,"相同课程",1,2))));
        var result=service.importImages(7,0,images);assertEquals(1,result.importedRows());assertEquals(1,result.schedule().courses().size());
        clearInvocations(schedules);
        when(ocr.recognizeBatch(eq(7L),anyList())).thenReturn(List.of(page(9,row(9,"相同课程",1,2)),page(9,row(9,"冲突课程",1,2))));
        assertEquals(422,assertThrows(ResponseStatusException.class,()->service.importImages(7,0,images)).getStatusCode().value());verify(schedules,never()).saveImported(anyLong(),any(),anyLong(),any());
    }
    @Test void nonOverlappingPartsOfOneWeekAreCombinedWithoutSilentlyDroppingEither(){
        when(ocr.recognizeBatch(eq(7L),anyList())).thenReturn(List.of(page(9,row(9,"上午课程",1,2)),page(9,row(9,"下午课程",5,6))));
        var result=service.importImages(7,0,images);assertEquals(2,result.importedRows());assertEquals(List.of(9),result.weeks());assertEquals(2,result.schedule().courses().size());
    }
    @Test void mixedTermsAmbiguousRowsAndPartialOverlapNeverWrite(){
        var other=new LocalTimetableOcrService.Result(2,"local-ocr","synthetic",false,"另一学期","2027-03-01",1,"2027-03-01",List.of(row(1,"另一课程",1,2)),List.of());
        for(var pages:List.of(List.of(page(9,row(9,"甲",1,2)),other),List.of(page(9,row(9,"甲",1,2)),page(9,row(9,"乙",2,3))),List.of(page(9,row(8,"错周次",1,2)),page(10,row(10,"乙",1,2))))){
            when(ocr.recognizeBatch(eq(7L),anyList())).thenReturn(pages);
            assertThrows(ResponseStatusException.class,()->service.importImages(7,0,images));
        }
        verify(schedules,never()).saveImported(anyLong(),any(),anyLong(),any());
    }
    @Test void staleVersionAndChangedSchoolNeverOverwriteOrRetry(){
        when(schedules.get(7L)).thenReturn(new State(snapshot(3,List.of())));
        assertEquals(409,assertThrows(ResponseStatusException.class,()->service.importImages(7,2,images)).getStatusCode().value());verifyNoInteractions(ocr);
        when(users.findById(7L)).thenReturn(user(1),user(2));
        assertEquals(403,assertThrows(ResponseStatusException.class,()->service.importImages(7,3,images)).getStatusCode().value());verify(schedules,never()).saveImported(anyLong(),any(),anyLong(),any());
    }
    @Test void middleRecognitionFailureLeavesTheWholeExistingScheduleIntact(){
        when(ocr.recognizeBatch(eq(7L),anyList())).thenThrow(new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,"第2张未读清"));
        assertEquals(422,assertThrows(ResponseStatusException.class,()->service.importImages(7,0,images)).getStatusCode().value());verify(schedules,never()).saveImported(anyLong(),any(),anyLong(),any());
    }
    @Test void aLateRevisionConflictIsNotRetried(){
        when(schedules.saveImported(eq(7L),any(),eq(1L),any())).thenThrow(new ResponseStatusException(HttpStatus.CONFLICT));
        assertEquals(409,assertThrows(ResponseStatusException.class,()->service.importImages(7,0,images)).getStatusCode().value());verify(schedules,times(1)).saveImported(eq(7L),any(),eq(1L),any());
    }
    @Test void reverseSelectionOrderStillHasTheSameWeeksAndCourseSemantics(){
        when(ocr.recognizeBatch(eq(7L),anyList())).thenReturn(List.of(page(10,row(10,"合成课程",9,10)),page(9,row(9,"合成课程",9,10))));
        var result=service.importImages(7,0,images);assertEquals(9,result.week());assertEquals(List.of(9,10),result.weeks());assertEquals(List.of(9,10),result.schedule().courses().get(0).weeks());
    }
}
