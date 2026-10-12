package com.campusai.controller;

import com.campusai.career.CampusJob;
import com.campusai.career.CareerService;
import com.campusai.service.UserService;
import com.campusai.user.entity.User;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import java.util.List;

@RestController
@RequestMapping("/api/career")
public class CareerController {
    private final CareerService career;
    private final UserService users;

    public CareerController(CareerService career, UserService users) {
        this.career = career;
        this.users = users;
    }

    @GetMapping("/jobs")
    public List<CampusJob> jobs(@RequestAttribute("currentUserId") Long userId) {
        User user = users.getById(userId);
        if (user == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "请先登录");
        return career.publishedJobs(user.getSchoolId());
    }
}
