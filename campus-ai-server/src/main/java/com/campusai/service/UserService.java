package com.campusai.service;

import com.campusai.dto.CreateUserRequest;
import com.campusai.user.entity.User;

public interface UserService {

    User getById(Long id);

    User register(CreateUserRequest request);
}