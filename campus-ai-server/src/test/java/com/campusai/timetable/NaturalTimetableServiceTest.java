package com.campusai.timetable;

import com.campusai.ai.client.AiModelClient;
import com.campusai.ai.model.*;
import com.campusai.ai.usage.*;
import com.campusai.mapper.UserMapper;
import com.campusai.user.entity.User;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;
import java.time.*;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class NaturalTimetableServiceTest {
    final AiModelClient model=mock(AiModelClient.class);
    final AiCallAdmission admission=mock(AiCallAdmission.class);
    final AiUsageRecorder usage=mock(AiUsageRecorder.class);
    final UserMapper users=mock(UserMapper.class);
    final UnifiedTimetableService timetable=mock(UnifiedTimetableService.class);
    final Clock clock=Clock.fixed(Instant.parse("2026-10-24T12:00:00Z"),ZoneOffset.UTC);
    final NaturalTimetableService service=new NaturalTimetableService(model,admission,usage,users,timetable,new ObjectMapper(),clock);
    final AiCallAdmission.Reservation reservation=new AiCallAdmission.Reservation(LocalDate.of(2026,10,24),2200,"intent-test");
    static final String QUERY="""
        {"kind":"QUERY","from":"2026-10-12","to":"2026-10-18","period":"ALL","selection":"ALL","detail":"SUMMARY","anchor":null,"course":"","perspective":"AUTO","reuseFocus":false,"reuseCourse":false}
        """;
    User active(long school){User u=new User();u.setId(7L);u.setSchoolId(school);u.setStatus(1);u.setRole("STUDENT");return u;}
    AiModelResult output(String text){return new AiModelResult("deepseek","intent-test",text,50,23,73);}
    @BeforeEach void ready(){when(users.findById(7L)).thenReturn(active(1));when(admission.reserveTokens(eq(7L),anyInt())).thenReturn(reservation);when(model.chat(anyList(),eq(AiModelProfile.STANDARD))).thenReturn(output(QUERY));}
    @Test void colloquialLastWeekQuestionActuallyCallsModelBeforeAuthorizedQuery(){
        var result=service.ask(7,new NaturalTimetableService.Request("上周什么课表",null));
        assertThat(result.query().from()).isEqualTo("2026-10-12");assertThat(result.query().to()).isEqualTo("2026-10-18");
        var order=inOrder(model,timetable);order.verify(model).chat(anyList(),eq(AiModelProfile.STANDARD));order.verify(timetable).query(7L,LocalDate.of(2026,10,12),LocalDate.of(2026,10,18),"ALL","ALL","SUMMARY",null,"","AUTO");
        verify(admission).settle(7L,reservation,73);verify(usage).record(eq(7L),isNull(),any(AiModelResult.class));verify(admission,never()).release(anyLong(),any(AiCallAdmission.Reservation.class));
    }
    @Test void promptUsesServerCalendarButNeverPrivateCourseOrFocusValues(){
        var previous=new NaturalTimetableService.Previous("2026-10-12","2026-10-18","ALL","ALL","SUMMARY",null,"PRIVATE_COURSE_42","TEACHER","2026-10-13T08:15","PRIVATE_FOCUS_NAME");
        service.ask(7,new NaturalTimetableService.Request("上周呢",previous));
        @SuppressWarnings("unchecked") ArgumentCaptor<List<AiChatMessage>> captured=ArgumentCaptor.forClass(List.class);verify(model).chat(captured.capture(),any());
        String prompt=captured.getValue().get(1).content();
        assertThat(prompt).contains("2026-10-24","2026-10-12","2026-10-18","hasFocus","hasCourse").doesNotContain("PRIVATE_COURSE_42","PRIVATE_FOCUS_NAME","08:15","userId","schoolId");
    }
    @Test void localFocusCanBeReusedWithoutGivingItToModel(){
        when(model.chat(anyList(),any())).thenReturn(output(QUERY.replace("\"selection\":\"ALL\"","\"selection\":\"AT\"").replace("\"reuseFocus\":false","\"reuseFocus\":true").replace("\"reuseCourse\":false","\"reuseCourse\":true")));
        var previous=new NaturalTimetableService.Previous("2026-10-12","2026-10-18","ALL","ALL","SUMMARY",null,"","AUTO","2026-10-13T08:15","PRIVATE_FOCUS_NAME");
        var result=service.ask(7,new NaturalTimetableService.Request("这节呢",previous));
        assertThat(result.query().anchor()).isEqualTo("2026-10-13T08:15");assertThat(result.query().course()).isEqualTo("PRIVATE_FOCUS_NAME");
    }
    @Test void malformedOrExcessiveModelOutputNeverReachesPrivateReader(){
        for(String response:List.of("not json",QUERY.replace("\"kind\"","\"userId\""),QUERY.replace("2026-10-18","2026-11-18"),QUERY.replace("\"AUTO\"","\"ADMIN\""),QUERY.replace("\"ALL\"","\"DROP_TABLE\""))){
            when(model.chat(anyList(),any())).thenReturn(output(response));assertThatThrownBy(()->service.ask(7,new NaturalTimetableService.Request("读课表",null))).isInstanceOf(ResponseStatusException.class).hasMessageContaining("502");
        }
        verifyNoInteractions(timetable);
    }
    @Test void clarificationUsesWhitelistedReasonNotModelAnswerText(){
        when(model.chat(anyList(),any())).thenReturn(output("{\"kind\":\"CLARIFY\",\"reason\":\"MISSING_DATE\"}"));
        var result=service.ask(7,new NaturalTimetableService.Request("我的课表",null));assertThat(result.query()).isNull();assertThat(result.clarification()).contains("哪一天");verifyNoInteractions(timetable);
        when(model.chat(anyList(),any())).thenReturn(output("{\"kind\":\"CLARIFY\",\"reason\":\"你有三节课\"}"));assertThatThrownBy(()->service.ask(7,new NaturalTimetableService.Request("我的课表",null))).hasMessageContaining("502");
    }
    @Test void disabledAccountDoesNotCallModelOrReserveQuota(){User disabled=active(1);disabled.setStatus(0);when(users.findById(7L)).thenReturn(disabled);assertThatThrownBy(()->service.ask(7,new NaturalTimetableService.Request("上周什么课表",null))).hasMessageContaining("403");verifyNoInteractions(model,admission,usage,timetable);}
    @Test void quotaExhaustionPreventsModelCall(){when(admission.reserveTokens(anyLong(),anyInt())).thenThrow(new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS));assertThatThrownBy(()->service.ask(7,new NaturalTimetableService.Request("上周课表",null))).hasMessageContaining("429");verifyNoInteractions(model,timetable);}
    @Test void modelFailureReleasesReservationAndDoesNotGuess(){when(model.chat(anyList(),any())).thenThrow(new IllegalStateException("offline"));assertThatThrownBy(()->service.ask(7,new NaturalTimetableService.Request("上周课表",null))).hasMessageContaining("offline");verify(admission).release(7L,reservation);verifyNoInteractions(timetable,usage);}
    @Test void schoolChangeWhileModelRunsStopsBeforePrivateRead(){when(users.findById(7L)).thenReturn(active(1),active(2));assertThatThrownBy(()->service.ask(7,new NaturalTimetableService.Request("上周课表",null))).hasMessageContaining("403");verifyNoInteractions(timetable);}
    @Test void authorizationFailureOfRequestedPerspectiveIsNotRetriedAsStudent(){when(timetable.query(anyLong(),any(),any(),anyString(),anyString(),anyString(),any(),anyString(),anyString())).thenThrow(new ResponseStatusException(HttpStatus.FORBIDDEN,"No teaching grant"));assertThatThrownBy(()->service.ask(7,new NaturalTimetableService.Request("我教的课",null))).hasMessageContaining("403");verify(timetable,times(1)).query(anyLong(),any(),any(),anyString(),anyString(),anyString(),any(),anyString(),anyString());}
    @Test void schoolChangeAfterReadPreventsReturningData(){when(users.findById(7L)).thenReturn(active(1),active(1),active(2));assertThatThrownBy(()->service.ask(7,new NaturalTimetableService.Request("上周课表",null))).hasMessageContaining("403");}
    @Test void oversizedQuestionAndInvalidPreviousAreRejectedBeforeModel(){assertThatThrownBy(()->service.ask(7,new NaturalTimetableService.Request("课".repeat(301),null))).hasMessageContaining("400");var previous=new NaturalTimetableService.Previous("bad","date",null,null,null,null,null,null,null,null);assertThatThrownBy(()->service.ask(7,new NaturalTimetableService.Request("这节呢",previous))).hasMessageContaining("400");verifyNoInteractions(model);}
}
