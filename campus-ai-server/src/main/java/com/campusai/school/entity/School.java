package com.campusai.school.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class School {

    private Long id;
    private String name;
    private String code;
    private Integer status;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}