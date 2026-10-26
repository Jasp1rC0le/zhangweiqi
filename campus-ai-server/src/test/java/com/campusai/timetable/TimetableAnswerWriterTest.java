package com.campusai.timetable;

import com.campusai.ai.client.AiModelClient;
import com.campusai.ai.model.*;
import com.campusai.ai.usage.*;
import org.junit.jupiter.api.*;
import org.mockito.ArgumentCaptor;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;
import java.time.*;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class TimetableAnswerWriterTest {
    final AiModelClient model=mock(AiModelClient.class);
    final AiCallAdmission admission=mock(AiCallAdmission.class);
    final AiUsageRecorder usage=mock(AiUsageRecorder.class);
    final TimetableAnswerWriter writer=new TimetableAnswerWriter(model,admission,usage,new ObjectMapper());
    final AiCallAdmission.Reservation held=new AiCallAdmission.Reservation(LocalDate.of(2026,10,25),2200,"writer-test");
    final LocalDate date=LocalDate.of(2026,10,13);
    final Instant now=Instant.parse("2026-10-24T18:00:00Z");
    final String prose="10月13日有1节合成课程，08:00—09:40，合成教师，合成教室。";
    AiModelResult output(String answer){return new AiModelResult("kimi","synthetic-writer",answer,60,25,85);}
    ScheduleQueryEngine.Answer facts(String name){
        var row=new UnifiedTimetableService.Entry("PRIVATE_ENTRY_ID","82",date,2,name,"合成教室","合成教师","PRIVATE_CLASS", "08:00","09:40",1,2,"08:00—09:40",List.of("TEACHING"),List.of("PRIVATE_ORIGIN"),false,false,false,null,null);
        return ScheduleQueryEngine.answer(ScheduleQueryEngine.parse(date,date,"ALL","ALL","SUMMARY",null),List.of(row),now,new ScheduleQueryEngine.QueryScope(1,"AUTO","STUDENT"));
    }
    @BeforeEach void ready(){when(admission.reserveTokens(eq(7L),anyInt())).thenReturn(held);when(model.chat(anyList(),eq(AiModelProfile.STANDARD))).thenReturn(output("{\"answer\":\""+prose+"\",\"usedFacts\":[1]}"));}
    @Test void modelReceivesAuthorizedFactsWithoutAccountRosterAttendanceOrDatabaseIdentifiers(){
        var source=facts("合成课程");var result=writer.write(7,"10.13",source,()->source);
        assertThat(result.result().answer()).isEqualTo(prose);assertThat(result.result().display()).isEqualTo(source.display());assertThat(result.narration().mode()).isEqualTo("model");
        @SuppressWarnings("unchecked") ArgumentCaptor<List<AiChatMessage>> capture=ArgumentCaptor.forClass(List.class);verify(model).chat(capture.capture(),eq(AiModelProfile.STANDARD));
        assertThat(capture.getValue().get(1).content()).contains("DATABASE_FACTS","合成课程","合成教师","合成教室","2026-10-13","08:00").doesNotContain("PRIVATE_ENTRY_ID","PRIVATE_CLASS","PRIVATE_ORIGIN","lessonId","userId","schoolId","attendance","password");
        verify(admission).settle(7L,held,85);verify(usage).record(eq(7L),isNull(),any());verify(admission,never()).release(anyLong(),any(AiCallAdmission.Reservation.class));
    }
    @Test void modelFailureStillReturnsFreshExactFactsAndReleasesOnlyItsOwnReservation(){
        when(model.chat(anyList(),any())).thenThrow(new IllegalStateException("offline"));var source=facts("合成课程");
        var result=writer.write(7,"10.13",source,()->source);assertThat(result.result()).isSameAs(source);assertThat(result.narration().reason()).isEqualTo("unavailable");verify(admission).release(7L,held);verifyNoInteractions(usage);
    }
    @Test void nullProviderResultDoesNotLeaveAQuotaHold(){
        when(model.chat(anyList(),any())).thenReturn(null);var source=facts("合成课程");assertThat(writer.write(7,"10.13",source,()->source).result()).isSameAs(source);verify(admission).release(7L,held);verifyNoInteractions(usage);
    }
    @Test void quotaFailurePreservesSuccessfulDatabaseReadWithoutCallingModel(){
        when(admission.reserveTokens(eq(7L),anyInt())).thenThrow(new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS));var source=facts("合成课程");assertThat(writer.write(7,"10.13",source,()->source).result()).isSameAs(source);verifyNoInteractions(model,usage);verify(admission,never()).release(anyLong(),any(AiCallAdmission.Reservation.class));
    }
    @Test void malformedMissingOrInventedReferencesAndDatabaseRefusalsUseFactsButMeterCompletedCalls(){
        var source=facts("合成课程");
        for(String raw:List.of("not json","{\"answer\":\"我没有你的课表数据库\",\"usedFacts\":[1]}","{\"answer\":\"看https://example.test\",\"usedFacts\":[1]}","{\"answer\":\"课程\",\"usedFacts\":[]}","{\"answer\":\"课程\",\"usedFacts\":[1,1]}","{\"answer\":\"课程\",\"usedFacts\":[2]}","{\"answer\":\"课程\",\"usedFacts\":[1],\"extra\":true}")){
            when(model.chat(anyList(),any())).thenReturn(output(raw));var result=writer.write(7,"10.13",source,()->source);assertThat(result.result()).isSameAs(source);assertThat(result.narration().reason()).isEqualTo("invalid-answer");
        }
        verify(usage,times(7)).record(eq(7L),isNull(),any());verify(admission,times(7)).settle(7L,held,85);
    }
    @Test void revokedScopeAfterModelLatencyPropagatesInsteadOfReturningOldFactsOrProse(){
        var source=facts("合成课程");assertThatThrownBy(()->writer.write(7,"10.13",source,()->{throw new ResponseStatusException(HttpStatus.FORBIDDEN);})).isInstanceOf(ResponseStatusException.class).hasMessageContaining("403");verify(usage).record(eq(7L),isNull(),any());
    }
    @Test void concurrentCourseChangeReturnsEntireLatestFactsNotStaleModelProse(){
        var old=facts("旧课程");var latest=facts("新课程");var result=writer.write(7,"10.13",old,()->latest);assertThat(result.result()).isSameAs(latest);assertThat(result.result().answer()).doesNotContain(prose,"旧课程");assertThat(result.narration().reason()).isEqualTo("updated");
    }
    @Test void changingOnlyReadTimestampDoesNotInvalidateOtherwiseIdenticalFacts(){
        var old=facts("合成课程");var latest=new ScheduleQueryEngine.Answer(old.version(),old.from(),old.to(),old.period(),old.selection(),old.detail(),old.anchor(),old.course(),now.plusSeconds(8),old.count(),old.unknownTimes(),old.focus(),old.answer(),old.display(),old.refinement(),old.queryScope());
        var result=writer.write(7,"10.13",old,()->latest);assertThat(result.narration().mode()).isEqualTo("model");assertThat(result.result().asOf()).isEqualTo(latest.asOf());
    }
    @Test void emptyScopeUsesNoInventedFactReferenceAndKeepsEmptyStructuredState(){
        var empty=ScheduleQueryEngine.answer(ScheduleQueryEngine.parse(date,date,"ALL","ALL","SUMMARY",null),List.of(),now);
        when(model.chat(anyList(),any())).thenReturn(output("{\"answer\":\"这一天没有已保存安排，不代表学校停课。\",\"usedFacts\":[]}"));var result=writer.write(7,"10.13",empty,()->empty);assertThat(result.result().count()).isZero();assertThat(result.result().display().entries()).isEmpty();assertThat(result.narration().mode()).isEqualTo("model");
    }
}
