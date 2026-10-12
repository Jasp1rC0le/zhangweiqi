package com.campusai.dto;

import lombok.Getter;
import lombok.Setter;

import jakarta.validation.constraints.Size;

@Getter
@Setter
public class CreateConversationRequest {

    @Size(max = 100, message = "会话标题不能超过100个字符")
    private String title;
}