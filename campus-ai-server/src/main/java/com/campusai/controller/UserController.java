package com.campusai.controller;

import com.campusai.dto.CreateUserRequest;
import com.campusai.dto.UserResponse;
import com.campusai.service.UserService;
import com.campusai.user.entity.User;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

import java.net.URI;

@RestController
@RequestMapping("/api/users")
public class UserController {

    private final UserService userService;

    public UserController(UserService userService) {
        this.userService = userService;
    }

    @GetMapping("/{id}")
    public ResponseEntity<UserResponse> getById(@PathVariable Long id,
            @RequestAttribute("currentUserId") Long currentUserId) {
        if (!id.equals(currentUserId)) return ResponseEntity.status(403).build();
        User user = userService.getById(id);

        if (user == null) {
            return ResponseEntity.notFound().build();
        }

        return ResponseEntity.ok(UserResponse.from(user));
    }

    @PostMapping
    public ResponseEntity<UserResponse> register(
            @Valid @RequestBody CreateUserRequest request) {

        User user = userService.register(request);

        URI location = ServletUriComponentsBuilder
                .fromCurrentRequest()
                .path("/{id}")
                .buildAndExpand(user.getId())
                .toUri();

        return ResponseEntity
                .created(location)
                .body(UserResponse.from(user));
    }
}
