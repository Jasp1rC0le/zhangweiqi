package com.campusai.career;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class CampusJob {
    private Long id;
    private Long schoolId;
    private Long employerId;
    private String title;
    private String employmentType;
    private String location;
    private String sourceUrl;
    private String description;
    private LocalDateTime postedAt;
    private LocalDateTime expiresAt;
    private String status;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
