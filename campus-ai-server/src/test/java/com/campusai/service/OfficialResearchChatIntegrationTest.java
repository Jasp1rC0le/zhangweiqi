package com.campusai.service;

import com.campusai.ai.client.AiModelClient;
import com.campusai.ai.model.*;
import com.campusai.conversation.entity.AiConversation;
import com.campusai.dto.CreateMessageRequest;
import com.campusai.mapper.*;
import com.campusai.message.entity.AiMessage;
import com.campusai.school.entity.School;
import com.campusai.search.*;
import com.campusai.search.model.WebSearchResult;
import com.campusai.service.impl.AiMessageServiceImpl;
import com.campusai.user.entity.User;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import java.util.*;
import java.util.concurrent.atomic.AtomicLong;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import static org.assertj.core.api.Assertions.*;

class OfficialResearchChatIntegrationTest {
 @ParameterizedTest @ValueSource(booleans={false,true})
 void normalChatAndStreamPassOnlyPlannedOfficialSourcesToModel(boolean streaming){
  var conversations=mock(AiConversationMapper.class);var messages=mock(AiMessageMapper.class);var citations=mock(AiMessageCitationMapper.class);
  var users=mock(UserMapper.class);var model=mock(AiModelClient.class);var knowledge=mock(KnowledgeSearchService.class);var web=mock(WebSearchService.class);var schools=mock(SchoolMapper.class);
  var school=new School();school.setName("天津中德应用技术大学");when(schools.findActiveById(1L)).thenReturn(school);
  var user=new User();user.setId(3L);user.setSchoolId(1L);user.setRole("STUDENT");user.setStatus(1);when(users.findById(3L)).thenReturn(user);
  var conversation=new AiConversation();conversation.setId(9L);conversation.setUserId(3L);when(conversations.findByIdAndUserId(9L,3L)).thenReturn(conversation);
  when(messages.findRecentByConversationId(anyLong(),anyInt())).thenReturn(List.of());var ids=new AtomicLong(100);var stored=new HashMap<Long,AiMessage>();
  when(messages.insert(any(AiMessage.class))).thenAnswer(c->{AiMessage m=c.getArgument(0);m.setId(ids.incrementAndGet());stored.put(m.getId(),m);return 1;});when(messages.findById(anyLong())).thenAnswer(c->stored.get(c.getArgument(0)));
  String question="请联网查询天津中德应用技术大学奖学金政策的官方入口，列出链接，不要推断个人资格。";
  var local=new com.campusai.knowledge.model.KnowledgeSearchResult();local.setDocumentId(7L);local.setChunkId(5L);local.setTitle("合成奖学金入口指引");local.setContent("合成公开内容，仅验证查询及引用传递");
  when(knowledge.search(1L,"天津中德应用技术大学 奖学金 申请 政策")).thenReturn(List.of(local));when(citations.insert(anyLong(),anyLong(),anyInt())).thenReturn(1);
  var official=new WebSearchResult("学生奖励栏目","https://xsgz.tsguas.edu.cn/xsgl1/xsjl.htm","合成官方入口摘要，仅测试源传递而非政策正文核验","");
  when(web.search("天津中德应用技术大学 奖学金 申请 政策")).thenReturn(List.of(new WebSearchResult("旧媒体事件","https://www.sohu.com/old","媒体旧文", "2023"),official));
  var expected=new AiModelResult("synthetic","stub-model","合成答复：[网络1]",1,1,2);var prompts=new ArrayList<String>();
  when(model.chat(any(),any())).thenAnswer(c->{prompts.add(c.getArgument(0,List.class).toString());return expected;});
  when(model.streamChat(any(),any(),any())).thenAnswer(c->{prompts.add(c.getArgument(0,List.class).toString());return expected;});
  var research=new OfficialWebResearchService(web,schools);
  var service=new AiMessageServiceImpl(conversations,messages,citations,mock(AiMessageFeedbackMapper.class),users,model,knowledge,web,(u,m,r)->{},u->{},null,research);
  var request=new CreateMessageRequest();request.setContent(question);request.setModel("standard");
  var response=streaming?service.streamChat(3L,9L,request,d->{}):service.chat(3L,9L,request);
  assertThat(response.getWebSources()).hasSize(1);assertThat(response.getWebSources().get(0).getUrl()).isEqualTo(official.url());
  assertThat(response.getUserMessage().getContent()).isEqualTo(question);
  assertThat(response.getSources()).hasSize(1);verify(knowledge).search(1L,"天津中德应用技术大学 奖学金 申请 政策");
  assertThat(String.join("\n",prompts)).contains("xsgz.tsguas.edu.cn").doesNotContain("sohu.com");
  verify(web).search("天津中德应用技术大学 奖学金 申请 政策");verify(web,never()).search(question);
 }
}
