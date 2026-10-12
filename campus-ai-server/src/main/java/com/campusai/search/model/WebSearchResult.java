package com.campusai.search.model;

public record WebSearchResult(
        String title,
        String url,
        String content,
        String publishedDate
) {
}
