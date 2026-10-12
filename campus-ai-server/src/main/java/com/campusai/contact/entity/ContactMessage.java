package com.campusai.contact.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class ContactMessage {

    private Long id;
    private Long userId;
    private Long schoolId;
    private String name;
    private String contact;
    private String subject;
    private String message;
    private String status;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
