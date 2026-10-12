package com.campusai.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class ReviewKnowledgeSubmissionRequest {

    @NotBlank(message = "请填写审核意见")
    @Size(max = 500, message = "审核意见不能超过500个字符")
    private String reviewNote;
}
