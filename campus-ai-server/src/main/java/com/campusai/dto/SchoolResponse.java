package com.campusai.dto;

import com.campusai.school.entity.School;
import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public class SchoolResponse {

    private Long id;
    private String name;
    private String code;

    public static SchoolResponse from(School school) {
        return new SchoolResponse(
                school.getId(),
                school.getName(),
                school.getCode()
        );
    }
}