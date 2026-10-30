package com.campusai.service;

import com.campusai.ai.client.AiModelClient;
import com.campusai.ai.model.AiModelProfile;
import com.campusai.ai.model.AiModelResult;
import com.campusai.conversation.entity.AiConversation;
import com.campusai.dto.CreateMessageRequest;
import com.campusai.knowledge.model.KnowledgeSearchResult;
import com.campusai.mapper.AiConversationMapper;
import com.campusai.mapper.AiMessageCitationMapper;
import com.campusai.mapper.AiMessageFeedbackMapper;
import com.campusai.mapper.AiMessageMapper;
import com.campusai.mapper.UserMapper;
import com.campusai.search.model.WebSearchResult;
import com.campusai.search.WebSearchService;
import com.campusai.message.entity.AiMessage;
import com.campusai.user.entity.User;
import com.campusai.service.impl.AiMessageServiceImpl;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.Arguments;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;
import java.util.HashMap;
import java.util.concurrent.atomic.AtomicLong;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@Timeout(10)
class AiMessageWebSearchScopeTest {
    private final WebSearchService web = mock(WebSearchService.class);
    private final AiMessageServiceImpl service = new AiMessageServiceImpl(
            mock(AiConversationMapper.class), mock(AiMessageMapper.class),
            mock(AiMessageCitationMapper.class), mock(AiMessageFeedbackMapper.class),
            mock(UserMapper.class), mock(AiModelClient.class),
            mock(KnowledgeSearchService.class), web, (userId, messageId, result) -> {});
    private final List<KnowledgeSearchResult> local = List.of(new KnowledgeSearchResult());

    @ParameterizedTest
    @ValueSource(strings = {
            "按学校新形态教材通知今天还能正常报送资助申请吗？",
            "请只按2027考研中德1250报考点公告区分材料。",
            "只按学校2026年9月15日通知回答户口办理期限。",
            "根据2026统计表比较历年招生结果。",
            "学校官网这份2025年政策的适用范围是什么？",
            "当前系统日期下，已立项教材的历史报送截止是否结束？",
            "按通知回看当年比赛报名要求，不推断新一届。",
            "学校这条招聘通知里的截止时间是什么？"
    })
    void knownLocalFactsDoNotTriggerWebByIncidentalWords(String question) {
        assertThat(find(question, local, AiModelProfile.STANDARD)).isEmpty();
        verifyNoInteractions(web);
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "搜索官网核对教材申报通知是否更新。", "请联网核对学校最新通知。",
            "查资料确认新的办理流程。", "检索官网查开放安排。",
            "学校最新政策有什么变化？", "学校附近实时天气怎样？"
    })
    void explicitSearchOrFreshnessStillUsesWeb(String question) {
        var expected = List.of(new WebSearchResult("公开资料", "https://example.edu/notice", "公开正文", ""));
        when(web.search(question)).thenReturn(expected);
        assertThat(find(question, local, AiModelProfile.STANDARD)).isEqualTo(expected);
        verify(web).search(question);
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "不联网，学校最新通知只按现有资料回答。",
            "不要搜索，我只想理解现有通知。",
            "无需联网，按当前日期比较历史截止。",
            "只用知识库判断政策。", "只按知识库回答奖学金申请。", "仅用本地资料回答助学金。"
    })
    void userOptOutAppliesEvenWithoutLocalResults(String question) {
        assertThat(find(question, List.of(), AiModelProfile.STANDARD)).isEmpty();
        verifyNoInteractions(web);
    }

    @ParameterizedTest
    @ValueSource(strings = {"你能联网吗？", "请问，你可以联网搜索吗？", "你不能联网吗？",
            "是否支持网页搜索？", "系统现在有网络搜索功能吗？", "能不能上网？"})
    void standaloneCapabilityQuestionsRemainAvailable(String question) {
        assertThat((Boolean) ReflectionTestUtils.invokeMethod(service, "asksWebCapability", question)).isTrue();
    }

    @ParameterizedTest
    @ValueSource(strings = {"不要联网，学校图书馆什么时候关门？", "不联网，能查课程规定吗？",
            "只用知识库，不要联网，新教师期末交什么材料？",
            "你能联网帮我查学校图书馆几点开门吗？", "可以上网搜索学校教师培养要求吗？",
            "学校网络搜索平台怎么使用？"})
    void substantiveQuestionsDoNotBecomeCapabilityAnswers(String question) {
        assertThat((Boolean) ReflectionTestUtils.invokeMethod(service, "asksWebCapability", question)).isFalse();
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "联网查我的学号12345678", "搜索官网处理我的身份证",
            "查资料并使用我的手机号13812345678", "联网查询student@example.com"
    })
    void explicitSearchDoesNotOverridePrivateQueryGuard(String question) {
        assertThat(find(question, List.of(), AiModelProfile.STANDARD)).isEmpty();
        verifyNoInteractions(web);
    }

    @Test
    void missingLocalKnowledgeCanStillSearchPublicSources() {
        String question = "学校通知里办理流程是什么？";
        when(web.search(question)).thenReturn(List.of());
        find(question, List.of(), AiModelProfile.STANDARD);
        verify(web).search(question);
    }

    @Test
    void specialistModulesRemainOfflineUnlessExplicitlyRequested() {
        for (var profile : List.of(AiModelProfile.KIMI, AiModelProfile.GLM)) {
            assertThat(find("帮我按论文附件整理实验步骤", List.of(), profile)).isEmpty();
        }
        verifyNoInteractions(web);
    }

    @Test
    void promptDoesNotForceCitationOfIrrelevantWebResults() {
        String prompt = ReflectionTestUtils.invokeMethod(service, "buildSystemPrompt",
                List.of(), List.of(), AiModelProfile.STANDARD, "");
        assertThat(prompt).contains("收到搜索结果不等于它们支持本题",
                "无关网页不引用、不补入学校规定", "本次搜索结果不能支持本题")
                .doesNotContain("必须引用[网络1]");
    }

    @ParameterizedTest
    @MethodSource("localAnswerCases")
    void synchronousAndStreamingAnswersKeepLocalSourcesWithoutWebNoise(boolean streaming, String question) {
        var conversations = mock(AiConversationMapper.class);
        var messages = mock(AiMessageMapper.class);
        var citations = mock(AiMessageCitationMapper.class);
        when(citations.insert(anyLong(), anyLong(), anyInt())).thenReturn(1);
        var model = mock(AiModelClient.class);
        var knowledge = mock(KnowledgeSearchService.class);
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
        var source = new KnowledgeSearchResult();
        source.setChunkId(5L);
        source.setDocumentId(7L);
        source.setTitle("2026新形态教材历史报送通知");
        source.setContent("原报送期限为2026年10月10日前，本次已结束。");
        source.setSourceUrl("https://example.edu/textbook");
        when(knowledge.search(1L, question)).thenReturn(List.of(source));
        when(messages.findRecentByConversationId(anyLong(), anyInt())).thenReturn(List.of());
        var ids = new AtomicLong(100L);
        var stored = new HashMap<Long, AiMessage>();
        when(messages.insert(any(AiMessage.class))).thenAnswer(call -> {
            AiMessage message = call.getArgument(0);
            message.setId(ids.incrementAndGet());
            stored.put(message.getId(), message);
            return 1;
        });
        when(messages.findById(anyLong())).thenAnswer(call -> stored.get(call.getArgument(0)));
        var result = new AiModelResult("test", "test", "该历史报送期限已结束。[资料1]", 1, 1, 2);
        when(model.chat(any(), any())).thenReturn(result);
        when(model.streamChat(any(), any(), any())).thenReturn(result);
        var scopedService = new AiMessageServiceImpl(conversations, messages,
                citations, mock(AiMessageFeedbackMapper.class),
                users, model, knowledge, web, (userId, messageId, usage) -> {});
        var request = new CreateMessageRequest();
        request.setContent(question);
        request.setModel("standard");
        var response = streaming ? scopedService.streamChat(3L, 9L, request, delta -> {})
                : scopedService.chat(3L, 9L, request);
        assertThat(response.getWebSources()).isEmpty();
        assertThat(response.getSources()).hasSize(1);
        assertThat(response.getAssistantMessage().getContent()).contains("历史报送期限已结束");
        verifyNoInteractions(web);
        if (streaming) verify(model).streamChat(any(), any(), any());
        else verify(model).chat(any(), any());
    }

    private static Stream<Arguments> localAnswerCases() {
        return Stream.of("按学校新形态教材通知今天还能正常报送资助申请吗？",
                "不要联网，只按已收录的基础实验实训中心制度回答：新教师第一年下企业多久，期末交什么材料？",
                "不联网，图书馆周末几点关门？", "只用知识库，新教师可以直接开课吗？")
                .flatMap(question -> Stream.of(Arguments.of(false, question), Arguments.of(true, question)));
    }

    @Test
    void sourceOnlyIntentNeverSearchesEvenWithEmptyKnowledgeInAnyMode() {
        for(var profile:List.of(AiModelProfile.STANDARD,AiModelProfile.KIMI,AiModelProfile.GLM))
            for(String q:List.of("只按这份奖学金原文解释申请条件","只用这份奖学金原文解释申请条件","仅用这份奖学金通知回答"))
                assertThat(find(q,List.of(),profile)).isEmpty();
        verifyNoInteractions(web);
    }
    @Test
    void dontOnlyUseKnowledgeMeansSupplementRatherThanOptOut() {
        String q="不要只用知识库，学校奖学金怎么申请？";
        var expected=List.of(new WebSearchResult("本校公开政策","https://xsgz.tsguas.edu.cn/","申请条件与申报程序",""));
        when(web.search(q)).thenReturn(expected);
        assertThat(find(q,local,AiModelProfile.STANDARD)).isEqualTo(expected);
        verify(web).search(q);
    }
    @Test
    void explicitNetworkOptOutAndPrivateDataStillWin() {
        assertThat(find("不要联网，也不要只用知识库判断奖学金",local,AiModelProfile.STANDARD)).isEmpty();
        assertThat(find("别只用知识库，联网查我的成绩和奖学金",List.of(),AiModelProfile.KIMI)).isEmpty();
        verifyNoInteractions(web);
    }
    @Test void conciseFormattingDoesNotDisableExplicitSearch() {
        String q="只用一句话，联网介绍天津中德应用技术大学奖学金官方入口";
        var expected=List.of(new WebSearchResult("本校公开政策","https://xsgz.tsguas.edu.cn/","公开入口",""));
        when(web.search(q)).thenReturn(expected);
        assertThat(find(q,List.of(),AiModelProfile.KIMI)).isEqualTo(expected);
    }

    private List<WebSearchResult> find(String question, List<KnowledgeSearchResult> localResults,
                                       AiModelProfile profile) {
        return ReflectionTestUtils.invokeMethod(service, "findWebResults", question, localResults, profile);
    }
}
