package com.campusai.dto;

import com.campusai.search.model.WebSearchResult;
import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public class WebSourceResponse {

    private String title;
    private String url;
    private String publishedDate;

    public static WebSourceResponse from(WebSearchResult result) {
        return new WebSourceResponse(
                result.title(),
                result.url(),
                result.publishedDate()
        );
    }
}
