package com.campusai.security;

import java.net.URI;
import java.util.Arrays;
import java.util.Set;
import java.util.stream.Collectors;

/** Exact origins only: no credentials, paths, queries, fragments or wildcard hosts. */
public final class TrustedOrigins {
    private TrustedOrigins() {}
    public static String parse(String value) {
        try {
            URI uri = URI.create(value);
            if (!("https".equals(uri.getScheme()) || "http".equals(uri.getScheme()))
                    || uri.getHost() == null || uri.getRawUserInfo() != null
                    || uri.getRawQuery() != null || uri.getRawFragment() != null
                    || !uri.getRawPath().isEmpty() || uri.getPort() > 65535
                    || !value.equals(uri.getScheme() + "://" + uri.getRawAuthority())) {
                throw new IllegalArgumentException();
            }
            return value;
        } catch (RuntimeException exception) {
            throw new IllegalArgumentException("来源必须是完整的HTTP/HTTPS来源，不含路径或凭据");
        }
    }
    public static Set<String> list(String values) {
        Set<String> origins = Arrays.stream(values.split(",", -1)).map(String::trim)
                .map(TrustedOrigins::parse).collect(Collectors.toUnmodifiableSet());
        if (origins.isEmpty()) throw new IllegalArgumentException("至少配置一个可信来源");
        return origins;
    }
    public static String fromReferer(String value) {
        URI uri = URI.create(value);
        if (uri.getRawUserInfo() != null) throw new IllegalArgumentException("无效来源");
        return parse(uri.getScheme() + "://" + uri.getRawAuthority());
    }
}
