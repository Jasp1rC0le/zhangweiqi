package com.campusai.service.impl;

import com.campusai.dto.LoginRequest;
import com.campusai.exception.InvalidCredentialsException;
import com.campusai.mapper.UserMapper;
import com.campusai.service.AuthService;
import com.campusai.user.entity.User;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

@Service
public class AuthServiceImpl implements AuthService {

    private final UserMapper userMapper;
    private final PasswordEncoder passwordEncoder;

    public AuthServiceImpl(
            UserMapper userMapper,
            PasswordEncoder passwordEncoder) {
        this.userMapper = userMapper;
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    public User login(LoginRequest request) {
        String username = request.getUsername().trim();

        User user = userMapper.findByUsername(username);

        if (user == null
                || user.getStatus() == null
                || user.getStatus() != 1
                || !passwordEncoder.matches(
                request.getPassword(),
                user.getPasswordHash())) {
            throw new InvalidCredentialsException("用户名或密码错误");
        }

        return user;
    }
}
