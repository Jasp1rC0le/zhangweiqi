package com.campusai.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.AssertTrue;

@Data
public class CreateUserRequest {

    @NotBlank(message = "用户名不能为空")
    @Size(min = 3, max = 50, message = "用户名长度必须为3到50个字符")
    private String username;

    @NotBlank(message = "密码不能为空")
    @Size(min = 6, max = 72, message = "密码长度必须为6到72个字符")
    private String password;

    @NotBlank(message = "昵称不能为空")
    @Size(max = 50, message = "昵称不能超过50个字符")
    private String nickname;
    @NotNull(message = "请选择学校")
    @Positive(message = "学校编号无效")
    private Long schoolId;

    @NotNull(message = "请先阅读并同意隐私说明")
    @AssertTrue(message = "请先阅读并同意隐私说明")
    private Boolean privacyAccepted;

    @NotBlank(message = "请刷新页面后重新阅读隐私说明")
    @Size(max = 32)
    private String policyVersion;
}
