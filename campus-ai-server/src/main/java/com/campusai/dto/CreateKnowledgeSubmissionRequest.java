package com.campusai.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class CreateKnowledgeSubmissionRequest {

    @NotBlank(message = "请说明这条资料对应的问题")
    @Size(max = 1000, message = "问题不能超过1000个字符")
    private String question;

    @NotBlank(message = "补充内容不能为空")
    @Size(max = 100000, message = "补充内容不能超过100000个字符")
    private String content;

    @Size(max = 1000, message = "来源链接不能超过1000个字符")
    @Pattern(
            regexp = "^$|https?://[^\\s]+$",
            message = "来源链接必须以http://或https://开头"
    )
    private String sourceUrl;
}
