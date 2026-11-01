package com.campusai.security;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import java.nio.charset.StandardCharsets;

public final class AccountPasswordPolicy {
    private AccountPasswordPolicy() {}
    public static void validateNew(String password){
        if(password==null || password.isBlank() || password.length()<6 || password.length()>72)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"密码须为6至72个字符");
        if(password.getBytes(StandardCharsets.UTF_8).length>72)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"密码过长，请缩短后重试");
    }
}
