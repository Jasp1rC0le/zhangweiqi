package com.campusai.search;
import com.campusai.knowledge.model.KnowledgeSearchResult;
import java.util.List;
import java.util.regex.Pattern;
/** Explainable supplement trigger; not an answer-correctness classifier. */
public final class PublicKnowledgeCoverage {
 private PublicKnowledgeCoverage() {}
 private static final List<List<String>> TOPICS=List.of(
  List.of("奖学金","奖助学金"),List.of("助学金","学生资助"),List.of("助学贷款","生源地贷款"),
  List.of("勤工助学"),List.of("医保","医疗保险"),List.of("入伍","征兵","服兵役"),List.of("就业","校招","招聘"),
  List.of("转专业"),List.of("学生证"),List.of("图书馆","借阅"),List.of("校园卡","一卡通"),List.of("发票","开票","税号"),
  List.of("户口","户籍"),List.of("毕业证明","在读证明"),List.of("考研","研究生招生"),List.of("四六级","英语四级","英语六级"),List.of("招生","录取"));
 private static final Pattern PINNED=Pattern.compile("只按|仅按|根据.*(?:资料|通知|规定|原文|统计表)|按学校|按通知|这份|这条|已收录|历史|当年|原文");
 private static final Pattern LOCAL_ONLY=Pattern.compile("只按|仅按|只根据|仅根据|只参考|仅参考|(?:只用|仅用)(?:这份|这条|那份|该份|该条|所给|提供的|已有|已收录|本地|知识库)");
 private static final Pattern NEGATED_ONLY=Pattern.compile("(?:不要|不能|别|不必|不用|不应|不)(?:只用|仅用|只按|仅按|只根据|仅根据|只参考|仅参考)");
 private static final Pattern YEAR=Pattern.compile("(?<!\\d)(20\\d{2})(?!\\d)");
 private static final Pattern MONEY=Pattern.compile("\\d[\\d,.]*\\s*(?:万)?元");
 private static final Pattern DATE=Pattern.compile("\\d{1,2}月\\d{1,2}日|20\\d{2}[-/]\\d{1,2}[-/]\\d{1,2}");
 public static boolean isPublicStudentTopic(String q){return TOPICS.stream().anyMatch(g->g.stream().anyMatch(q::contains));}
 public static boolean requiresLocalOnly(String q){return LOCAL_ONLY.matcher(NEGATED_ONLY.matcher(q).replaceAll("")).find();}
 public static boolean needsSupplement(String q,List<KnowledgeSearchResult> local){
  var groups=TOPICS.stream().filter(g->g.stream().anyMatch(q::contains)).toList();if(groups.isEmpty())return false;
  if(NEGATED_ONLY.matcher(q).find())return true;
  if(PINNED.matcher(q).find())return false;
  String text=local.stream().map(r->String.valueOf(r.getTitle())+"\n"+String.valueOf(r.getContent())).reduce("",(a,b)->a+"\n"+b);
  if(groups.stream().anyMatch(g->g.stream().noneMatch(text::contains)))return true;
  var years=YEAR.matcher(q);while(years.find())if(!text.contains(years.group(1)))return true;
  if(q.matches(".*(?:多少钱|金额|额度).*?")&&!MONEY.matcher(text).find())return true;
  if(q.matches(".*(?:什么时候|哪天|截止日期|申请期限).*?")&&!DATE.matcher(text).find())return true;
  return q.matches(".*(?:怎么申请|如何申请|申请条件|需要什么材料).*?")&&!text.matches("(?s).*(?:申请条件|提交|申报|办理|申请材料).*?");
 }
}
