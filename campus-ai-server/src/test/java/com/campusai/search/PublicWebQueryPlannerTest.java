package com.campusai.search;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;
class PublicWebQueryPlannerTest {
 private static final String S="天津中德应用技术大学";
 @Test void officialEntrypointUsesShortObservedKeywordShape(){var p=PublicWebQueryPlanner.plan("请联网查询天津中德应用技术大学奖学金政策的官方入口，列出链接，不要推断个人资格。",S);assertThat(p.query()).isEqualTo(S+" 奖学金 申请 政策");assertThat(p.officialOnly()).isTrue();assertThat(p.query()).doesNotContain("个人资格","列出链接");}
 @Test void requestedYearsAndAwardTypeRemain(){var p=PublicWebQueryPlanner.plan("我校2026国家励志奖学金官网入口",S);assertThat(p.query()).contains("2026","国家励志奖学金");}
 @Test void anotherNamedSchoolIsNotReplacedWithCurrentCampus(){var p=PublicWebQueryPlanner.plan("请查询北京大学奖学金官方入口",S);assertThat(p.query()).contains("北京大学").doesNotContain(S);assertThat(p.accepts("https://www.pku.edu.cn/","北京大学奖学金")).isTrue();}
 @Test void domainBoundaryAndPolicyFacetExcludeMediaAndPersonalLists(){var p=PublicWebQueryPlanner.plan("学校奖学金政策官方入口",S);assertThat(p.accepts("https://xsgz.tsguas.edu.cn/xsgl1/xsjl.htm","学生奖励")).isTrue();for(String u:new String[]{"https://tsguas.edu.cn.evil.test/","https://www.sohu.com/news","http://127.0.0.1/admin"})assertThat(p.accepts(u,"学校奖学金")).isFalse();assertThat(p.accepts("https://xsgz.tsguas.edu.cn/info/1/2.htm","关于助学金评定问题的情况通报")).isFalse();assertThat(p.accepts("https://xsgz.tsguas.edu.cn/info/1/2.htm","国家奖学金推荐名单")).isFalse();}
 @Test void explicitNewsQuestionKeepsGeneralWeb(){var p=PublicWebQueryPlanner.plan("2023天津中德助学金事件有哪些媒体报道",S);assertThat(p.officialOnly()).isFalse();assertThat(p.accepts("https://www.sohu.com/news","媒体报道")).isTrue();}
 @Test void normalizedSensitiveIdentifiersNeverGoToSearch(){for(String q:new String[]{"学校奖学金申请，电话１３８００００００００","学号１２３４５６７８９奖学金","学校账户ｔｏｋｅｎ","奖学金申请 contact@example.com"})assertThat(PublicWebQueryPlanner.plan(q,S).query()).isEmpty();}
 @Test void nationalPolicyDoesNotAcquireAnUnrequestedCampus(){var p=PublicWebQueryPlanner.plan("国家奖学金最新资助标准是什么",S);assertThat(p.query()).doesNotContain(S);assertThat(p.allowedDomains()).containsExactly("gov.cn");}
 @Test void genericCampusPronounUsesVerifiedSchool(){var p=PublicWebQueryPlanner.plan("我们学校的学生证办理流程",S);assertThat(p.query()).startsWith(S);}
 @Test void entrypointKeepsFreshnessAndEducationStage(){var p=PublicWebQueryPlanner.plan("我校今年本科国家奖学金官网入口",S);assertThat(p.query()).contains("今年","本科","国家奖学金");}
 @Test void namedAwardAndPolicyDetailsAreNotReducedToGenericScholarship(){for(String q:new String[]{"我校2026校长奖学金官网入口","我校国家奖学金官网入口以及申请截止日期"}){var p=PublicWebQueryPlanner.plan(q,S);assertThat(p.query()).contains(q.contains("校长")?"校长奖学金":"截止日期");}}
 @Test void vendorOfficialDocsAreNotMistakenForCampusGovernmentPages(){for(String q:new String[]{"Java官方API文档","Campthink官方隐私说明","苹果官方网站入口"})assertThat(PublicWebQueryPlanner.plan(q,S).officialOnly()).isFalse();}
 @Test void campusServicesKeepSchoolContextWithoutForcingEveryLifestyleQueryToGovernment(){var p=PublicWebQueryPlanner.plan("图书馆几点关门",S);assertThat(p.query()).startsWith(S);var food=PublicWebQueryPlanner.plan("学校食堂哪家好吃",S);assertThat(food.query()).startsWith(S);assertThat(food.officialOnly()).isFalse();}
 @Test void technicalExamplesDoNotAcquireAnUnrequestedSchool(){var p=PublicWebQueryPlanner.plan("Java图书馆系统官方API文档",S);assertThat(p.query()).doesNotContain(S);assertThat(p.officialOnly()).isFalse();}
}
