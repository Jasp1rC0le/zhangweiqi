package com.campusai.dto;

import jakarta.validation.Validation;
import jakarta.validation.Validator;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class RequestValidationTest {

    private final Validator validator = Validation
            .buildDefaultValidatorFactory()
            .getValidator();

    @Test
    void shouldRejectIncompleteContactMessage() {
        CreateContactMessageRequest request =
                new CreateContactMessageRequest();
        request.setName("张同学");

        assertThat(validator.validate(request))
                .extracting(violation -> violation.getPropertyPath().toString())
                .contains("contact", "subject", "message");
    }

    @Test
    void shouldRejectUnsafeKnowledgeSourceUrl() {
        CreateKnowledgeSubmissionRequest request =
                new CreateKnowledgeSubmissionRequest();
        request.setQuestion("图书馆几点关门？");
        request.setContent("工作日 22:00 关闭");
        request.setSourceUrl("javascript:alert(1)");

        assertThat(validator.validate(request))
                .anyMatch(violation ->
                        "sourceUrl".equals(
                                violation.getPropertyPath().toString()
                        )
                );
    }

    @Test
    void shouldRejectUnsupportedModelKey() {
        CreateMessageRequest request = new CreateMessageRequest();
        request.setContent("帮我查询图书馆开放时间");
        request.setModel("fake-pro");

        assertThat(validator.validate(request))
                .anyMatch(violation ->
                        "model".equals(
                                violation.getPropertyPath().toString()
                        )
                );
    }

    @Test
    void shouldAcceptKimiAndGlmModelKeys() {
        CreateMessageRequest request = new CreateMessageRequest();
        request.setContent("请解释这段代码");

        request.setModel("kimi");
        assertThat(validator.validate(request)).isEmpty();

        request.setModel("glm");
        assertThat(validator.validate(request)).isEmpty();
    }
}
