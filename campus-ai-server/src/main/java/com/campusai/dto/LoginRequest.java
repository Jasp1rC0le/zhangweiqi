package com.campusai.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class LoginRequest {

    @NotBlank(message = "用户名不能为空")
    @jakarta.validation.constraints.Size(max = 50)
    private String username;

    @NotBlank(message = "密码不能为空")
    @jakarta.validation.constraints.Size(max = 72)
    private String password;
}
