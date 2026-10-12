package com.campusai.controller;

import com.campusai.dto.SchoolResponse;
import com.campusai.mapper.SchoolMapper;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/schools")
public class SchoolController {

    private final SchoolMapper schoolMapper;

    public SchoolController(SchoolMapper schoolMapper) {
        this.schoolMapper = schoolMapper;
    }

    @GetMapping
    public ResponseEntity<List<SchoolResponse>> findAll() {
        List<SchoolResponse> schools = schoolMapper
                .findAllActive()
                .stream()
                .map(SchoolResponse::from)
                .toList();

        return ResponseEntity.ok(schools);
    }
}
