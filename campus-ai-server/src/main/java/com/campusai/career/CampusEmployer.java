package com.campusai.career;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class CampusEmployer {
    private Long id;
    private Long schoolId;
    private String name;
    private String industry;
    private String websiteUrl;
    private String description;
    private String status;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
