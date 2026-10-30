package com.campusai.controller;

import com.campusai.dto.SchoolResponse;
import com.campusai.mapper.SchoolMapper;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

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

    public record InvoiceInfo(String unitName, String taxId, String sourceUrl, String checkedOn) {}

    @GetMapping("/{id}/invoice")
    public InvoiceInfo invoice(@PathVariable Long id) {
        var school = schoolMapper.findActiveById(id);
        if (school == null || !"天津中德应用技术大学".equals(school.getName()))
            throw new ResponseStatusException(HttpStatus.NOT_FOUND,"本校开票信息暂未收录");
        return new InvoiceInfo(school.getName(),"12120000401200249U","https://cwsj.tsguas.edu.cn/","2026-10-31");
    }
}
