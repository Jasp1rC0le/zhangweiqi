package com.campusai.search;

import com.campusai.search.model.WebSearchResult;

import java.util.List;

/**
 * 可替换的网页搜索适配层。实现必须在供应商不可用时返回空列表，
 * 不能让一次搜索故障拖垮整个聊天请求。
 */
public interface WebSearchService {

    List<WebSearchResult> search(String query);

    default boolean isAvailable() {
        return false;
    }
}
