package com.campusai.operations;

import com.campusai.search.BochaWebSearchService;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Map;

/** One fixed public query through the configured adapter; never calls a model or writes knowledge. */
public final class PublicSearchProbe {
    public static void main(String[] args) throws Exception {
        if(args.length!=1 || !"--one-public-query".equals(args[0]))
            throw new IllegalArgumentException("Use --one-public-query; no automatic retry");
        String base=System.getenv().getOrDefault("WEB_SEARCH_BASE_URL","https://api.bochaai.com");
        if(!"https://api.bochaai.com".equals(base))throw new IllegalArgumentException("Unexpected configured search host; stop for inspection");
        var service=new BochaWebSearchService(base,System.getenv("BOCHA_API_KEY"),true,5);
        if(!service.isAvailable())throw new IllegalStateException("Search provider is not configured");
        var rows=service.search("天津中德应用技术大学 奖学金 申请 政策");
        System.out.println(new ObjectMapper().writeValueAsString(Map.of("query","天津中德应用技术大学 奖学金 申请 政策",
                "resultCount",rows.size(),"sources",rows.stream().map(r->Map.of("title",r.title(),"url",r.url())).toList())));
        if(rows.isEmpty())System.exit(2);
    }
}
