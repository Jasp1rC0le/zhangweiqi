package com.campusai.dto;

import com.campusai.contact.entity.ContactMessage;
import lombok.AllArgsConstructor;
import lombok.Getter;

import java.time.LocalDateTime;

@Getter
@AllArgsConstructor
public class ContactMessageResponse {

    private Long id;
    private String name;
    private String contact;
    private String subject;
    private String message;
    private String status;
    private LocalDateTime createdAt;

    public static ContactMessageResponse from(ContactMessage contactMessage) {
        return new ContactMessageResponse(
                contactMessage.getId(),
                contactMessage.getName(),
                contactMessage.getContact(),
                contactMessage.getSubject(),
                contactMessage.getMessage(),
                contactMessage.getStatus(),
                contactMessage.getCreatedAt()
        );
    }
}
