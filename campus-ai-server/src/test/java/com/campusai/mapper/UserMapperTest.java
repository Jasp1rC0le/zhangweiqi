package com.campusai.mapper;

import com.campusai.user.entity.User;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest
@EnabledIfEnvironmentVariable(
        named = "RUN_MYSQL_INTEGRATION_TESTS",
        matches = "true"
)
class UserMapperTest {

    @Autowired
    private UserMapper userMapper;

    @Test
    void testFindById() {
        User user = userMapper.findById(1L);
        System.out.println(user);
    }
}
