package com.campusai.service;

import com.campusai.ai.client.AiModelClient;
import com.campusai.ai.model.AiModelResult;
import com.campusai.ai.usage.AiDailyQuotaService;
import com.campusai.conversation.entity.AiConversation;
import com.campusai.dto.CreateMessageRequest;
import com.campusai.mapper.*;
import com.campusai.message.entity.AiMessage;
import com.campusai.service.impl.AiMessageServiceImpl;
import com.campusai.user.entity.User;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Consumer;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** Real JDBC quota accounting with deterministic model responses; no paid API calls. */
class AiTokenAccountingFlowTest {
    private final AiMessageMapper messages = mock(AiMessageMapper.class);
    private final AiModelClient model = mock(AiModelClient.class);
    private AiDailyQuotaService quota;
    private AiMessageServiceImpl service;
    private CreateMessageRequest request;
    private JdbcTemplate jdbc;

    @BeforeEach
    void setup() {
        jdbc = new JdbcTemplate(new DriverManagerDataSource(
                "jdbc:h2:mem:" + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1", "sa", ""));
        jdbc.execute("CREATE TABLE users(id BIGINT PRIMARY KEY,role VARCHAR(20),status INT)");
        jdbc.execute("INSERT INTO users VALUES(3,'STUDENT',1)");
        jdbc.execute("CREATE TABLE ai_daily_token_quota (user_id BIGINT, usage_date DATE, used_tokens INT, PRIMARY KEY(user_id, usage_date))");
        jdbc.execute("CREATE TABLE ai_token_reservations(id VARCHAR(36) PRIMARY KEY,user_id BIGINT,usage_date DATE,reserved_tokens INT,actual_tokens INT,state VARCHAR(16),created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)");
        quota = new AiDailyQuotaService(jdbc, 60000);
        var conversations = mock(AiConversationMapper.class);
        var users = mock(UserMapper.class);
        var conversation = new AiConversation();
        conversation.setId(9L);
        conversation.setUserId(3L);
        when(conversations.findByIdAndUserId(9L, 3L)).thenReturn(conversation);
        var user = new User();
        user.setId(3L);
        user.setRole("STUDENT");
        user.setSchoolId(1L);
        when(users.findById(3L)).thenReturn(user);
        when(messages.findRecentByConversationId(anyLong(), anyInt())).thenReturn(List.of());
        var stored = new HashMap<Long, AiMessage>();
        var ids = new AtomicLong();
        when(messages.insert(any())).thenAnswer(call -> {
            AiMessage message = call.getArgument(0);
            message.setId(ids.incrementAndGet());
            stored.put(message.getId(), message);
            return 1;
        });
        when(messages.findById(anyLong())).thenAnswer(call -> stored.get(call.getArgument(0)));
        service = new AiMessageServiceImpl(conversations, messages, mock(AiMessageCitationMapper.class),
                mock(AiMessageFeedbackMapper.class), users, model, mock(KnowledgeSearchService.class),
                query -> List.of(), (userId, messageId, result) -> {}, quota);
        request = new CreateMessageRequest();
        request.setModel("kimi");
        request.setContent("帮我整理一个研究提纲");
    }

    @Test
    void streamsAndSettlesActualUsageRatherThanRequestCount() {
        when(model.streamChat(anyList(), any(), any())).thenAnswer(call -> {
            assertThat(quota.status(3L).used()).isGreaterThanOrEqualTo(6000);
            Consumer<String> delta = call.getArgument(2);
            delta.accept("研究提纲");
            return new AiModelResult("kimi", "test-model", "研究提纲", 300, 120, 420);
        });
        var output = new StringBuilder();
        var result = service.streamChat(3L, 9L, request, output::append);
        assertThat(result).isNotNull();
        assertThat(output).hasToString("研究提纲");
        assertThat(quota.status(3L).used()).isEqualTo(420);
        assertThat(quota.status(3L).remaining()).isEqualTo(59580);
        assertThat(quota.status(3L).unit()).isEqualTo("tokens");
    }

    @Test
    void synchronousReplyAlsoSettlesActualTokens() {
        when(model.chat(anyList(), any())).thenReturn(new AiModelResult("kimi", "test", "提纲", 200, 50, 250));
        service.chat(3L, 9L, request);
        assertThat(quota.status(3L).used()).isEqualTo(250);
    }

    @Test
    void usesReportedInputAndOutputWhenProviderOmitsTotal() {
        when(model.chat(anyList(), any())).thenReturn(new AiModelResult("kimi", "test", "提纲", 300, 80, null));
        service.chat(3L, 9L, request);
        assertThat(quota.status(3L).used()).isEqualTo(380);
    }

    @Test
    void fallsBackToTextEstimateWhenProviderOmitsUsage() {
        when(model.chat(anyList(), any())).thenReturn(new AiModelResult("kimi", "test", "提纲", null, null, null));
        service.chat(3L, 9L, request);
        assertThat(quota.status(3L).used()).isBetween(1, 5999);
    }

    @Test
    void settlementAcrossMidnightUsesOriginalReservationDay() {
        var yesterday = java.time.LocalDate.now(java.time.ZoneId.of("Asia/Shanghai")).minusDays(1);
        jdbc.update("INSERT INTO ai_daily_token_quota VALUES (?, ?, ?)", 3L, java.sql.Date.valueOf(yesterday), 6000);
        String reservationId = UUID.randomUUID().toString();
        jdbc.update("INSERT INTO ai_token_reservations(id,user_id,usage_date,reserved_tokens,state) VALUES (?,?,?,?,?)",
                reservationId, 3L, java.sql.Date.valueOf(yesterday), 6000, "RESERVED");
        quota.settle(3L, new com.campusai.ai.usage.AiCallAdmission.Reservation(yesterday, 6000, reservationId), 420);
        assertThat(quota.status(3L).used()).isZero();
        assertThat(jdbc.queryForObject("SELECT used_tokens FROM ai_daily_token_quota WHERE usage_date=?",
                Integer.class, java.sql.Date.valueOf(yesterday))).isEqualTo(420);
    }

    @Test
    void failuresReleaseReservation() {
        when(model.streamChat(anyList(), any(), any())).thenThrow(new IllegalStateException("provider unavailable"));
        assertThatThrownBy(() -> service.streamChat(3L, 9L, request, text -> {})).hasMessage("provider unavailable");
        assertThat(quota.status(3L).used()).isZero();
    }

    @Test
    void administratorStreamsPastDailyLimitAndRecordsActualUsage() {
        jdbc.update("UPDATE users SET role='ADMIN' WHERE id=3");
        quota.settle(3L, quota.reserveTokens(3L, 60001), 60001);
        when(model.streamChat(anyList(), any(), any())).thenReturn(
                new AiModelResult("kimi", "test-model", "测试回答", 300, 120, 420));
        service.streamChat(3L, 9L, request, text -> {});
        assertThat(quota.status(3L).used()).isEqualTo(60421);
        assertThat(quota.status(3L).unlimited()).isTrue();
        assertThat(quota.activity(3L)).hasSize(2);
    }

    @Test
    void administratorStillReachesProviderSpendGuardAndFailureReleasesOnlyNewReservation() {
        jdbc.update("UPDATE users SET role='ADMIN' WHERE id=3");
        quota.settle(3L, quota.reserveTokens(3L, 60001), 60001);
        var guard=mock(com.campusai.ai.usage.AiSpendGuard.class);
        var provider=mock(AiModelClient.class);
        when(guard.reserve(anyString(),anyString(),anyList(),anyInt())).thenThrow(
                new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.TOO_MANY_REQUESTS,"全站预算已达上限"));
        var metered=new com.campusai.ai.client.MeteredAiModelClient(provider,guard,"kimi","test-model",6000,"test-only");
        when(model.streamChat(anyList(),any(),any())).thenAnswer(call ->
                metered.streamChat(call.getArgument(0),call.getArgument(1),call.getArgument(2)));
        assertThatThrownBy(()->service.streamChat(3L,9L,request,text->{})).hasMessageContaining("全站预算已达上限");
        verify(guard).reserve(anyString(),anyString(),anyList(),anyInt());
        verifyNoInteractions(provider);
        assertThat(quota.status(3L).used()).isEqualTo(60001);
        assertThat(quota.activity(3L)).extracting(AiDailyQuotaService.Activity::state).contains("RELEASED");
    }

    @Test
    void failedMessageSaveReleasesReservationBeforeModelCall() {
        doThrow(new IllegalStateException("write failed")).when(messages).insert(any());
        assertThatThrownBy(() -> service.streamChat(3L, 9L, request, text -> {})).hasMessage("write failed");
        assertThat(quota.status(3L).used()).isZero();
        verifyNoInteractions(model);
    }

    @Test
    void fullHistoryIsBudgetedBeforeSavingOrCallingModel() {
        var history = new AiMessage();
        history.setRole("assistant");
        history.setContent("长文".repeat(60000));
        when(messages.findRecentByConversationId(anyLong(), anyInt())).thenReturn(List.of(history));
        assertThatThrownBy(() -> service.streamChat(3L, 9L, request, text -> {})).hasMessageContaining("429");
        verify(messages, never()).insert(any());
        verifyNoInteractions(model);
    }

    @Test
    void localClockDoesNotConsumeModelTokens() {
        request.setContent("现在几点了");
        service.streamChat(3L, 9L, request, text -> {});
        assertThat(quota.status(3L).used()).isZero();
        verifyNoInteractions(model);
    }

    @Test
    void concurrentReservationsCannotExceedLimit() throws Exception {
        quota.reserveTokens(3L, 1);
        var executor = Executors.newFixedThreadPool(8);
        try {
            List<Callable<Boolean>> calls = new ArrayList<>();
            for (int i = 0; i < 12; i++) calls.add(() -> {
                try { quota.reserveTokens(3L, 10000); return true; }
                catch (org.springframework.web.server.ResponseStatusException exhausted) { return false; }
            });
            int accepted = 0;
            for (var future : executor.invokeAll(calls)) if (future.get()) accepted++;
            assertThat(accepted).isEqualTo(5);
            assertThat(quota.status(3L).used()).isEqualTo(50001);
        } finally { executor.shutdownNow(); }
    }
}
