package com.campusai.dto;

import com.campusai.knowledge.model.KnowledgeSearchResult;
import com.campusai.message.entity.AiMessage;
import com.campusai.search.model.WebSearchResult;
import lombok.AllArgsConstructor;
import lombok.Getter;

import java.util.List;

@Getter
@AllArgsConstructor
public class ChatResponse {

    private MessageResponse userMessage;
    private MessageResponse assistantMessage;
    private List<KnowledgeSourceResponse> sources;
    private List<WebSourceResponse> webSources;

    public static ChatResponse from(
            AiMessage userMessage,
            AiMessage assistantMessage,
            List<KnowledgeSearchResult> searchResults) {

        return from(
                userMessage,
                assistantMessage,
                searchResults,
                List.of()
        );
    }

    public static ChatResponse from(
            AiMessage userMessage,
            AiMessage assistantMessage,
            List<KnowledgeSearchResult> searchResults,
            List<WebSearchResult> webSearchResults) {

        List<KnowledgeSourceResponse> sources =
                searchResults.stream()
                        .map(KnowledgeSourceResponse::from)
                        .toList();

        List<WebSourceResponse> webSources =
                webSearchResults.stream()
                        .map(WebSourceResponse::from)
                        .toList();

        return new ChatResponse(
                MessageResponse.from(userMessage),
                MessageResponse.from(assistantMessage),
                sources,
                webSources
        );
    }
}
