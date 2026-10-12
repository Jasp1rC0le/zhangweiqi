package com.campusai.service;

import com.campusai.dto.LoginRequest;
import com.campusai.user.entity.User;

public interface AuthService {

    User login(LoginRequest request);
}
