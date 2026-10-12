package com.campusai.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.Pattern;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class CreateMessageRequest {

    @NotBlank(message = "消息内容不能为空")
    @Size(max = 50000, message = "消息内容不能超过50000个字符")
    private String content;

    @Pattern(
            regexp = "standard|thinking|pro|kimi|glm",
            message = "不支持的模型档位"
    )
    private String model;
}
