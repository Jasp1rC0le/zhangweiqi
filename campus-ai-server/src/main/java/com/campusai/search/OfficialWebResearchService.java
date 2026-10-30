package com.campusai.search;

import com.campusai.mapper.SchoolMapper;
import com.campusai.search.model.WebSearchResult;
import org.springframework.stereotype.Service;
import java.util.*;
import java.net.URI;

@Service
public class OfficialWebResearchService {
    private final WebSearchService web;
    private final SchoolMapper schools;
    public OfficialWebResearchService(WebSearchService web,SchoolMapper schools){this.web=web;this.schools=schools;}
    public String knowledgeQuery(Long schoolId,String question) {
        if(PublicKnowledgeCoverage.requiresLocalOnly(question))return question;
        var plan=plan(schoolId,question);
        return plan.officialOnly()&&!plan.query().isEmpty()?plan.query():question;
    }
    public List<WebSearchResult> search(Long schoolId,String question) {
        var plan=plan(schoolId,question);
        if(plan.query().isEmpty())return List.of();
        var rows=web.search(plan.query());
        if(rows==null)return List.of();
        var seen=new HashSet<String>();
        return rows.stream().filter(Objects::nonNull)
                .filter(r->r.url()!=null&&plan.accepts(r.url(),r.title())&&seen.add(r.url()))
                .sorted(Comparator.comparingInt(r->sourceRank(r.url(),plan)))
                .limit(5).toList();
    }
    private PublicWebQueryPlanner.Plan plan(Long schoolId,String question) {
        var school=schoolId==null?null:schools.findActiveById(schoolId);
        return PublicWebQueryPlanner.plan(question,school==null?null:school.getName());
    }
    private static int sourceRank(String url,PublicWebQueryPlanner.Plan plan) {
        String host=URI.create(url).getHost().toLowerCase(Locale.ROOT);
        if(plan.allowedDomains().contains("tsguas.edu.cn")&&(host.equals("tsguas.edu.cn")||host.endsWith(".tsguas.edu.cn")))return 0;
        return host.equals("gov.cn")||host.endsWith(".gov.cn")?1:2;
    }
}
