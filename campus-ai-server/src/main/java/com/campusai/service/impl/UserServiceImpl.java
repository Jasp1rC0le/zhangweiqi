package com.campusai.service.impl;

import com.campusai.dto.CreateUserRequest;
import com.campusai.exception.UsernameAlreadyExistsException;
import com.campusai.mapper.UserMapper;
import com.campusai.service.UserService;
import com.campusai.user.entity.User;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import com.campusai.mapper.SchoolMapper;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

@Service
public class UserServiceImpl implements UserService {

    private final UserMapper userMapper;
    private final PasswordEncoder passwordEncoder;
    private final SchoolMapper schoolMapper;
    private final JdbcTemplate jdbc;

    public UserServiceImpl(
            UserMapper userMapper,
            SchoolMapper schoolMapper,
            PasswordEncoder passwordEncoder,
            JdbcTemplate jdbc) {
        this.userMapper = userMapper;
        this.schoolMapper = schoolMapper;
        this.passwordEncoder = passwordEncoder;
        this.jdbc = jdbc;
    }
    @Override
    public User getById(Long id) {
        return userMapper.findById(id);
    }

    @Override
    @Transactional
    public User register(CreateUserRequest request) {
        if (!Boolean.TRUE.equals(request.getPrivacyAccepted())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "请先阅读并同意隐私说明");
        }
        if (!com.campusai.security.PrivacyPolicyVersion.CURRENT.equals(request.getPolicyVersion())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "隐私说明已更新，请刷新页面并重新阅读同意");
        }
        String username = request.getUsername().trim();
        String nickname = request.getNickname().trim();

        User existingUser = userMapper.findByUsername(username);

        if (existingUser != null) {
            throw new UsernameAlreadyExistsException("用户名已存在");
        }
        if (schoolMapper.findActiveById(request.getSchoolId()) == null) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "学校不存在或暂不可用"
            );
        }

        User user = new User();
        user.setUsername(username);
        user.setPasswordHash(
                passwordEncoder.encode(request.getPassword())
        );
        user.setNickname(nickname);
        user.setSchoolId(request.getSchoolId());
        user.setRole("STUDENT");
        user.setStatus(1);

        int affectedRows = userMapper.insert(user);

        if (affectedRows != 1) {
            throw new IllegalStateException("用户创建失败");
        }

        jdbc.update("INSERT INTO user_privacy_consents (user_id, policy_version) VALUES (?, ?)",
                user.getId(), request.getPolicyVersion());

        return userMapper.findById(user.getId());
    }
}
