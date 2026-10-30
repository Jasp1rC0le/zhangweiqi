package com.campusai.search;
import com.campusai.knowledge.model.KnowledgeSearchResult;
import org.junit.jupiter.api.Test;
import java.util.List;
import static org.assertj.core.api.Assertions.*;
class PublicKnowledgeCoverageTest {
 List<KnowledgeSearchResult> text(String b){var r=new KnowledgeSearchResult();r.setTitle("学校已收资料");r.setContent(b);return List.of(r);}
 @Test void unrelatedHitsDoNotSuppressScholarships(){assertThat(PublicKnowledgeCoverage.needsSupplement("学校奖学金怎么申请",text("校园卡充值步骤"))).isTrue();}
 @Test void catalogueIsNotApplicationInstructions(){assertThat(PublicKnowledgeCoverage.needsSupplement("奖学金需要什么材料",text("学校设有国家奖学金、市政府奖学金"))).isTrue();}
 @Test void pinnedOriginalStaysLocal(){assertThat(PublicKnowledgeCoverage.needsSupplement("只按这份奖学金原文解释申请条件",text("旧资料"))).isFalse();}
 @Test void yearAndAmountNeedEvidence(){assertThat(PublicKnowledgeCoverage.needsSupplement("2026年奖学金多少钱",text("2025年奖学金8000元"))).isTrue();assertThat(PublicKnowledgeCoverage.needsSupplement("奖学金多少钱",text("奖学金标准另见通知"))).isTrue();}
 @Test void completeLocalAnswerDoesNotRequireSearch(){assertThat(PublicKnowledgeCoverage.needsSupplement("2026奖学金怎么申请",text("2026奖学金申请条件：二年级以上；提交申请材料至学院。"))).isFalse();}
 @Test void ordinaryWritingIsNotForcedOnline(){assertThat(PublicKnowledgeCoverage.isPublicStudentTopic("帮我优化实验报告的结构")).isFalse();}
}
