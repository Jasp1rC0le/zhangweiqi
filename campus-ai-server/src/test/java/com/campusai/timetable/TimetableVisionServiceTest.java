package com.campusai.timetable;
import com.campusai.ai.model.AiModelResult;
import com.campusai.ai.usage.*;
import com.campusai.mapper.UserMapper;
import com.campusai.user.entity.User;
import org.junit.jupiter.api.*;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;
import java.awt.image.BufferedImage;
import javax.imageio.ImageIO;
import java.io.ByteArrayOutputStream;
import java.time.LocalDate;
import java.util.*;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

@Timeout(10)
class TimetableVisionServiceTest {
    final TimetableVisionModel model=mock(TimetableVisionModel.class);final AiCallAdmission admission=mock(AiCallAdmission.class);final AiSpendGuard budget=mock(AiSpendGuard.class);final AiUsageRecorder usage=mock(AiUsageRecorder.class);final UserMapper users=mock(UserMapper.class);
    final TimetableVisionService service=new TimetableVisionService(model,admission,budget,usage,users,new ObjectMapper());byte[] png;
    static final String JSON="""
        {"semester":"合成学期","firstMonday":"2026-09-07","rows":[{"name":"合成课","weekday":1,"startTime":null,"endTime":null,"startPeriod":1,"endPeriod":2,"weeks":[1,3],"room":"测试室"}]}
        """;
    User active(long school){var u=new User();u.setId(7L);u.setSchoolId(school);u.setStatus(1);return u;}
    AiModelResult response(String content){return new AiModelResult("kimi","kimi-k3",content,120,80,200);}
    @BeforeEach void setup()throws Exception{
        var out=new ByteArrayOutputStream();ImageIO.write(new BufferedImage(30,20,BufferedImage.TYPE_INT_RGB),"png",out);png=out.toByteArray();
        when(users.findById(7L)).thenReturn(active(1));when(model.capability()).thenReturn(new TimetableVisionModel.Capability(1,true,"kimi","kimi-k3","api.moonshot.cn",2097152,120,12000,6000));
        when(model.estimate(any(),anyString())).thenReturn(150);when(model.recognize(any(),anyString())).thenReturn(response(JSON));
        when(admission.reserveTokens(eq(7L),anyInt())).thenAnswer(i->new AiCallAdmission.Reservation(LocalDate.of(2026,10,24),i.getArgument(1),"reservation-"+i.getArgument(1)));
        when(budget.reserveVision(anyString(),anyString(),anyInt(),anyInt())).thenReturn(new AiSpendGuard.Ticket("vision-test"));
    }
    @Test void explicitConsentAndActiveOwnerRequiredBeforeAnyImageSend(){assertThatThrownBy(()->service.recognize(7,png,false)).hasMessageContaining("400");verifyNoInteractions(model,admission,budget,usage);}
    @Test void disabledOwnerDoesNotInspectImageOrCallProvider(){var u=active(1);u.setStatus(0);when(users.findById(7L)).thenReturn(u);assertThatThrownBy(()->service.recognize(7,png,true)).hasMessageContaining("403");verifyNoInteractions(model,admission,budget,usage);}
    @Test void animatedPngCannotUseDifferentPreviewFrames(){var apng=new byte[png.length+20];System.arraycopy(png,0,apng,0,8);java.nio.ByteBuffer.wrap(apng,8,4).putInt(8);System.arraycopy("acTL".getBytes(),0,apng,12,4);System.arraycopy(png,8,apng,28,png.length-8);assertThatThrownBy(()->service.recognize(7,apng,true)).hasMessageContaining("动态PNG");verify(model,never()).estimate(any(),anyString());verifyNoInteractions(admission);}
    @Test void validatesBytesBeforeQuotaAndReencodesPixels(){assertThatThrownBy(()->service.recognize(7,new byte[]{1,2,3},true)).hasMessageContaining("400");verifyNoInteractions(admission,usage,budget);verify(model,never()).estimate(any(),anyString());var raw=Arrays.copyOf(png,png.length+20);System.arraycopy("private-trailer".getBytes(),0,raw,png.length,15);service.recognize(7,raw,true);verify(model).recognize(argThat(b->Arrays.equals(b,png)),eq("image/png"));}
    @Test void visionQuotasUseProviderInputEstimateAndActualUsageWithoutHistory(){var result=service.recognize(7,png,true);assertThat(result.rows()).hasSize(1);assertThat(result.rows().get(0).weeks()).containsExactly(1,3);var order=inOrder(admission,model,budget,usage);order.verify(admission).reserveTokens(7L,6000);order.verify(model).estimate(any(),eq("image/png"));order.verify(admission).reserveTokens(7L,150);order.verify(budget).reserveVision("kimi","kimi-k3",150,6000);order.verify(model).recognize(any(),eq("image/png"));verify(admission).settle(eq(7L),argThat((AiCallAdmission.Reservation r)->r.tokens()==150),eq(120));verify(admission).settle(eq(7L),argThat((AiCallAdmission.Reservation r)->r.tokens()==6000),eq(80));verify(usage).record(eq(7L),isNull(),any());}
    @Test void unknownWeekAndDateStayUnfilledForReview(){when(model.recognize(any(),anyString())).thenReturn(response(JSON.replace("\"weeks\":[1,3]","\"weeks\":[]").replace("\"2026-09-07\"","null")));var result=service.recognize(7,png,true);assertThat(result.firstMonday()).isNull();assertThat(result.rows().get(0).weeks()).isEmpty();assertThat(result.warnings()).anyMatch(s->s.contains("待补充"));}
    @Test void explicitCourseTeacherIsReturnedAsTextWithoutInferringAnAccount(){when(model.recognize(any(),anyString())).thenReturn(response(JSON.replace("\"room\":\"测试室\"","\"room\":\"测试室\",\"teacher\":\"合成教师甲\"")));assertThat(service.recognize(7,png,true).rows().get(0).teacher()).isEqualTo("合成教师甲");when(model.recognize(any(),anyString())).thenReturn(response(JSON.replace("\"room\":\"测试室\"","\"room\":\"测试室\",\"teacherId\":77")));assertThatThrownBy(()->service.recognize(7,png,true)).hasMessageContaining("502");}
    @Test void invalidModelFieldsDatesRangesAndEmptyRowsNeverProduceSaveableResult(){for(String v:List.of(JSON.replace("\"semester\"","\"userId\""),JSON.replace("2026-09-07","2026-09-08"),JSON.replace("\"weekday\":1","\"weekday\":8"),JSON.replace("\"weeks\":[1,3]","\"weeks\":[31]"),"{\"rows\":[]}","not JSON")){when(model.recognize(any(),anyString())).thenReturn(response(v));assertThatThrownBy(()->service.recognize(7,png,true)).hasMessageContaining("502");}verify(admission,never()).release(anyLong(),any(AiCallAdmission.Reservation.class));}
    @Test void exhaustedAllowanceStopsBeforeImageLeaves(){when(admission.reserveTokens(7L,6000)).thenThrow(new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS));assertThatThrownBy(()->service.recognize(7,png,true)).hasMessageContaining("429");verify(model,never()).estimate(any(),anyString());verify(model,never()).recognize(any(),anyString());}
    @Test void schoolChangeAfterEstimateStopsRecognitionAndReleasesUserHold(){when(users.findById(7L)).thenReturn(active(1),active(2));assertThatThrownBy(()->service.recognize(7,png,true)).hasMessageContaining("403");verify(model,never()).recognize(any(),anyString());verify(admission).release(eq(7L),argThat((AiCallAdmission.Reservation r)->r.tokens()==6000));}
    @Test void modelFailureDoesNotRetryAndKeepsProviderAccounting(){when(model.recognize(any(),anyString())).thenThrow(new ResponseStatusException(HttpStatus.BAD_GATEWAY,"fixture"));assertThatThrownBy(()->service.recognize(7,png,true)).hasMessageContaining("502");verify(model,times(1)).recognize(any(),anyString());verify(budget).failed(new AiSpendGuard.Ticket("vision-test"));verify(admission,times(2)).release(eq(7L),any(AiCallAdmission.Reservation.class));verifyNoInteractions(usage);}
    @Test void accountingFailureAfterUpstreamCompletionDoesNotFreeUserReservation(){doThrow(new IllegalStateException("ledger unavailable")).when(budget).complete(any(),any());assertThatThrownBy(()->service.recognize(7,png,true)).hasMessageContaining("ledger unavailable");verify(admission,never()).release(anyLong(),any(AiCallAdmission.Reservation.class));}
    @Test void sameOwnerCannotLaunchDuplicateWhileFirstImageIsPending()throws Exception{var entered=new CountDownLatch(1);var release=new CountDownLatch(1);when(model.estimate(any(),anyString())).thenAnswer(i->{entered.countDown();release.await(5,TimeUnit.SECONDS);return 150;});var pool=Executors.newSingleThreadExecutor();try{var first=pool.submit(()->service.recognize(7,png,true));assertThat(entered.await(3,TimeUnit.SECONDS)).isTrue();assertThatThrownBy(()->service.recognize(7,png,true)).hasMessageContaining("429");release.countDown();assertThat(first.get(5,TimeUnit.SECONDS).rows()).hasSize(1);}finally{release.countDown();pool.shutdownNow();}}
}
