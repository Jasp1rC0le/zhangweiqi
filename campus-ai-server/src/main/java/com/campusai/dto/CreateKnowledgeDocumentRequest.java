package com.campusai.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;

@Getter
@Setter
public class CreateKnowledgeDocumentRequest {

    @Pattern(regexp="[a-f0-9]{64}",message="资料核对版本无效")
    private String expectedRevisionTag;

    @NotNull(message = "请选择资料所属学校")
    @Positive(message = "学校编号无效")
    private Long schoolId;

    @NotBlank(message = "资料标题不能为空")
    @Size(max = 200, message = "资料标题不能超过200个字符")
    private String title;

    @NotBlank(message = "资料分类不能为空")
    @Size(max = 50, message = "资料分类不能超过50个字符")
    private String category;

    @Size(max = 100, message = "发布部门不能超过100个字符")
    private String sourceDepartment;

    @Size(max = 1000, message = "资料链接不能超过1000个字符")
    @Pattern(
            regexp = "^$|https?://[^\\s]+$",
            message = "资料链接必须以http://或https://开头"
    )
    private String sourceUrl;

    private LocalDateTime publishedAt;
    private LocalDateTime effectiveAt;
    private LocalDateTime expiresAt;

    @NotBlank(message = "资料正文不能为空")
    @Size(
            max = 100000,
            message = "资料正文不能超过100000个字符"
    )
    private String content;
}
