package com.campusai.search;

import java.net.URI;
import java.text.Normalizer;
import java.util.*;
import java.util.regex.Pattern;

/** Public policy questions use short keywords and verified source boundaries, not chat instructions. */
public final class PublicWebQueryPlanner {
    private PublicWebQueryPlanner() {}
    private static final String SCHOOL="天津中德应用技术大学", DOMAIN="tsguas.edu.cn";
    private static final Pattern OFFICIAL=Pattern.compile("官方|官网|校方|政策|管理办法|管理规定|实施细则|申请条件|申请流程|办理流程|资助标准");
    private static final Pattern STUDENT_POLICY=Pattern.compile("奖学金|奖助学金|助学金|助学贷款|学籍|转专业|校园卡|学生证|户籍|开票|学费|收费|住宿费");
    private static final Pattern NEWS=Pattern.compile("事件|新闻|争议|报道|舆情|网友|吐槽");
    private static final Pattern CAMPUS=Pattern.compile("我校|本校|学校|校内|我们大学|这所大学|图书馆|校园卡|学生证|转专业|户籍|开票|学费|收费|住宿费|宿舍|食堂|快递");
    private static final Pattern TECHNICAL=Pattern.compile("java|python|vue|react|spring|javascript|typescript|sdk|\\bapi\\b|代码|编程|算法|系统设计",Pattern.CASE_INSENSITIVE);
    private static final Pattern NAMED_SCHOOL=Pattern.compile("[\\p{IsHan}]{2,20}(?:大学|学院)");
    private static final Pattern YEAR=Pattern.compile("(?<!\\d)20\\d{2}(?!\\d)");
    private static final Pattern IDENTIFIER=Pattern.compile("\\d{8,}|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}");
    private static final Pattern SECRET=Pattern.compile("密码|验证码|身份证|手机号|手机号码|学号|登录令牌|token",Pattern.CASE_INSENSITIVE);
    private static final Pattern PRIVATE_LIST=Pattern.compile("获奖名单|推荐名单|公示名单|评审结果|评选结果");
    private static final Pattern INCIDENT=Pattern.compile("评定问题|情况通报|事件|舆情|调查内幕");

    public record Plan(String query,List<String> allowedDomains,boolean officialOnly,boolean policyOnly) {
        public boolean accepts(String url,String title) {
            if(!BochaWebSearchService.safeLink(url))return false;
            if(!officialOnly)return true;
            String host=URI.create(url).getHost().toLowerCase(Locale.ROOT).replaceAll("\\.$","");
            if(allowedDomains.stream().noneMatch(d->host.equals(d)||host.endsWith("."+d)))return false;
            return !policyOnly || (!PRIVATE_LIST.matcher(String.valueOf(title)).find()&&!INCIDENT.matcher(String.valueOf(title)).find());
        }
    }

    public static Plan plan(String question,String currentSchool) {
        String q=Normalizer.normalize(question==null?"":question,Normalizer.Form.NFKC).replaceAll("[\\u200B-\\u200D\\uFEFF]","").strip();
        if(q.isEmpty()||q.length()>500||IDENTIFIER.matcher(q).find()||SECRET.matcher(q).find())return new Plan("",List.of(),false,false);
        boolean news=NEWS.matcher(q).find();
        boolean explicitCampus=q.contains(SCHOOL)||q.contains("天津中德")||q.matches(".*(?:我校|本校|我们学校|校内).*?");
        boolean technical=TECHNICAL.matcher(q).find()&&!explicitCampus;
        boolean campusContext=STUDENT_POLICY.matcher(q).find()||CAMPUS.matcher(q).find()
                ||q.contains(SCHOOL)||NAMED_SCHOOL.matcher(q.replace("大学生","")).find();
        boolean official=campusContext&&!technical&&(OFFICIAL.matcher(q).find()||(!news&&STUDENT_POLICY.matcher(q).find()));
        String target=q.contains(SCHOOL)||q.contains("天津中德")?SCHOOL:null;
        if(target==null&&!technical&&currentSchool!=null&&(q.contains(currentSchool)||CAMPUS.matcher(q).find()))target=currentSchool;
        String withoutTarget=target==null?q:q.replace(target,"");
        withoutTarget=withoutTarget.replaceAll("大学生|我们大学|这所大学","");
        boolean otherSchool=NAMED_SCHOOL.matcher(withoutTarget).find();
        if(otherSchool)target=null;
        boolean national=target==null&&!otherSchool&&(q.contains("国家")||q.contains("全国")||q.contains("教育部")||q.contains("财政部"));
        List<String> domains=!official?List.of():SCHOOL.equals(target)?List.of(DOMAIN,"gov.cn"):
                national?List.of("gov.cn"):List.of("edu.cn","gov.cn","edu","ac.uk","edu.hk","edu.tw");
        String compact=q.replaceAll("(?:请|帮我)?(?:联网|上网)(?:查询|搜索|检索|查)?","")
                .replaceAll("请(?:查询|搜索|检索)|帮我查|列出链接|给我链接","")
                .replaceAll("(?:不要|无需|不必)(?:推断|判断|评估)(?:任何)?个人资格","")
                .replaceAll("[，,。！？?!；;]+"," ").replaceAll("\\s+"," ").strip();
        // Only the simple entrypoint request is shortened; named awards and policy facets stay intact.
        var qualifiers=new LinkedHashSet<String>();var years=YEAR.matcher(q);while(years.find())qualifiers.add(years.group());
        for(String term:List.of("最新","今年","本年度","本学年","本学期","本专科","本科","高职","专科","硕士研究生","博士研究生","研究生","硕士","博士","预科"))if(q.contains(term))qualifiers.add(term);
        String simple=compact.replace(SCHOOL,"").replaceAll("我校|本校|我们学校|学校|我们大学|\\s","");
        for(String value:qualifiers)simple=simple.replace(value,"");
        boolean entrypoint=simple.matches("的?(?:国家励志奖学金|国家奖学金|奖学金|奖助学金)的?(?:申请)?(?:政策)?的?(?:官方|官网)?(?:入口|官网|官方网站|网页)(?:在哪|在哪里|是什么|链接|地址|是哪个)?");
        if(official&&SCHOOL.equals(target)&&entrypoint) {
            String topic=q.contains("国家励志奖学金")?"国家励志奖学金":q.contains("国家奖学金")?"国家奖学金":"奖学金";
            compact=SCHOOL+" "+topic+" 申请 政策";
            if(!qualifiers.isEmpty())compact+=" "+String.join(" ",qualifiers);
        } else if(target!=null&&!compact.contains(target))compact=target+" "+compact;
        return new Plan(compact,domains,official,official&&!news);
    }
}
