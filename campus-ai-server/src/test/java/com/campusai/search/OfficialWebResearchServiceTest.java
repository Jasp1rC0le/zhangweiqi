package com.campusai.search;
import com.campusai.mapper.SchoolMapper;
import com.campusai.school.entity.School;
import com.campusai.search.model.WebSearchResult;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.mockito.Mockito.*;
import static org.assertj.core.api.Assertions.*;
class OfficialWebResearchServiceTest {
 @Test void currentSchoolPolicyReceivesOnlyOfficialRelevantSources(){var web=mock(WebSearchService.class);var schools=mock(SchoolMapper.class);var school=new School();school.setName("天津中德应用技术大学");when(schools.findActiveById(1L)).thenReturn(school);
  String q="天津中德应用技术大学 奖学金 申请 政策";
  var official=new WebSearchResult("学生奖励","https://xsgz.tsguas.edu.cn/xsgl1/xsjl.htm","合成目录摘要，仅验证入口传递，不证明政策全文","2026-01-01");
  var gov=new WebSearchResult("国家资助政策","https://www.mof.gov.cn/aid","合成国家政策摘要","2024-10-29");
  when(web.search(q)).thenReturn(List.of(new WebSearchResult("2023事件评论","https://www.toutiao.com/comment","旧媒体内容","2023"),gov,official,official,new WebSearchResult("国家奖学金推荐名单","https://xsgz.tsguas.edu.cn/names","不应转写名单","2026")));
  assertThat(new OfficialWebResearchService(web,schools).search(1L,"请联网查询天津中德应用技术大学奖学金政策的官方入口，列出链接，不要推断个人资格。")).containsExactly(official,gov);verify(web).search(q);
 }
 @Test void nonPolicyQuestionDoesNotLoseOrdinaryWebSources(){var web=mock(WebSearchService.class);var schools=mock(SchoolMapper.class);var row=new WebSearchResult("技术资料","https://example.org/guide","公开摘要","");when(web.search("Java异常如何排查")).thenReturn(List.of(row));assertThat(new OfficialWebResearchService(web,schools).search(null,"Java异常如何排查")).containsExactly(row);}
 @Test void normalizedIdentifiersRejectBeforeAnyProviderRequest(){var web=mock(WebSearchService.class);var service=new OfficialWebResearchService(web,mock(SchoolMapper.class));assertThat(service.search(null,"手机号１３８００００００００奖学金怎么申请")).isEmpty();verifyNoInteractions(web);}
}
