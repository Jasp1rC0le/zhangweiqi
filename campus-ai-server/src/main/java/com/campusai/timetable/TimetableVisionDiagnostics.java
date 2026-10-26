package com.campusai.timetable;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.converter.HttpMessageConversionException;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.client.UnknownContentTypeException;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;

import java.net.ConnectException;
import java.net.SocketTimeoutException;
import java.net.UnknownHostException;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/** Logs only closed-vocabulary diagnostics, never bodies, exception text or headers. */
final class TimetableVisionDiagnostics {
    private static final Logger LOG = LoggerFactory.getLogger(TimetableVisionDiagnostics.class);
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final Set<String> CODES = Set.of("invalid_request_error", "authentication_error", "permission_error",
            "rate_limit_error", "insufficient_quota", "server_error", "not_found_error", "invalid_api_key",
            "model_not_found", "context_length_exceeded", "invalid_parameter", "unsupported_parameter",
            "resource_not_found_error", "invalid_authentication_error", "incorrect_api_key_error",
            "permission_denied_error", "engine_overloaded_error", "exceeded_current_quota_error", "rate_limit_reached_error");
    private static final List<String> FIELDS = List.of("max_completion_tokens", "max_tokens", "reasoning_effort",
            "response_format", "thinking", "image_url", "messages", "model", "temperature", "top_p");
    enum Phase { ESTIMATE, RECOGNIZE }
    record Detail(String category, int status, String providerCode, String field) {}

    static Detail classify(RuntimeException failure) {
        if (failure instanceof RestClientResponseException response) {
            int status = response.getStatusCode().value();
            String category = status == 401 || status == 403 ? "AUTHORIZATION" : status == 429 ? "RATE_LIMIT"
                    : status >= 500 ? "UPSTREAM_SERVER" : "UPSTREAM_REQUEST";
            String code = "unrecognized", field = "unspecified";
            try {
                byte[] body = response.getResponseBodyAsByteArray();
                if (body.length <= 16384) {
                    var error = JSON.readTree(body).path("error");
                    String candidate = error.path("code").asText();
                    if (!CODES.contains(candidate)) candidate = error.path("type").asText();
                    if (CODES.contains(candidate)) code = candidate;
                    String parameter = error.path("param").asText();
                    if (FIELDS.contains(parameter)) field = parameter;
                    else {
                        String message = error.path("message").asText();
                        for (String known : FIELDS) if (message.contains(known)) { field = known; break; }
                    }
                }
            } catch (RuntimeException ignored) { /* Untrusted or non-JSON provider response is never logged. */ }
            if (status == 404 && field.equals("model")) category = "MODEL_UNAVAILABLE";
            return new Detail(category, status, code, field);
        }
        Throwable current = failure;
        for (int depth = 0; current != null && depth < 8; depth++, current = current.getCause()) {
            if (current instanceof SocketTimeoutException) return new Detail("TRANSPORT_TIMEOUT", 0, "none", "none");
            if (current instanceof ConnectException || current instanceof UnknownHostException)
                return new Detail("TRANSPORT_CONNECT", 0, "none", "none");
            if (current instanceof HttpMessageConversionException || current instanceof UnknownContentTypeException)
                return new Detail("RESPONSE_DECODE", 0, "none", "none");
        }
        return new Detail("UNEXPECTED", 0, "none", "none");
    }

    static ResponseStatusException failure(Phase phase, RuntimeException failure) {
        Detail detail = classify(failure);
        String reference = UUID.randomUUID().toString().substring(0, 8);
        LOG.warn("Timetable vision failure ref={} phase={} category={} httpStatus={} providerCode={} field={}",
                reference, phase, detail.category(), detail.status(), detail.providerCode(), detail.field());
        String stage = phase == Phase.ESTIMATE ? "图片用量估算" : "图片识别";
        String explanation = switch (detail.category()) {
            case "AUTHORIZATION" -> "服务身份或访问权限校验未通过，需要核对现有配置";
            case "MODEL_UNAVAILABLE" -> "当前配置的模型不存在或账号无访问权限，请核对模型名称和账号开通状态";
            case "RATE_LIMIT" -> "服务商限制了本次请求，请核对额度或限流状态";
            case "UPSTREAM_REQUEST" -> "服务商未接受本次请求，需要核对接口兼容性";
            case "UPSTREAM_SERVER" -> "服务商暂时未能处理请求";
            case "TRANSPORT_TIMEOUT" -> "等待服务商响应超时";
            case "TRANSPORT_CONNECT" -> "未能建立服务连接";
            case "RESPONSE_DECODE" -> "服务响应格式无法读取";
            default -> "未能完成，请凭诊断编号核对";
        };
        String code = detail.status() == 0 ? detail.category() : "HTTP " + detail.status();
        return new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                "Kimi" + stage + "：" + explanation + "（" + code + "，诊断 " + reference + "）；课表未改变，不自动重试");
    }
}
