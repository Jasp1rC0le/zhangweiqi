package com.campusai.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class CreateContactMessageRequest {

    @jakarta.validation.constraints.Pattern(regexp = "(?i)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", message = "提交编号无效")
    private String requestId;

    @NotBlank(message = "请填写你的称呼")
    @Size(max = 80, message = "称呼不能超过80个字符")
    private String name;

    @NotBlank(message = "请填写联系方式")
    @Size(max = 120, message = "联系方式不能超过120个字符")
    private String contact;

    @NotBlank(message = "请填写联系主题")
    @Size(max = 120, message = "主题不能超过120个字符")
    private String subject;

    @NotBlank(message = "请填写具体内容")
    @Size(max = 5000, message = "内容不能超过5000个字符")
    private String message;
}
