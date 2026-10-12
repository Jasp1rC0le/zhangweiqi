package com.campusai.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class MessageFeedbackRequest {

    @NotNull(message = "请选择回答是否有帮助")
    private Boolean helpful;

    @Size(max = 500, message = "反馈说明不能超过500个字符")
    private String reason;
}
