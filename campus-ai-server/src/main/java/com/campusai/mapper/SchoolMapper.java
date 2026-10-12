package com.campusai.mapper;

import com.campusai.school.entity.School;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface SchoolMapper {

    List<School> findAllActive();

    School findActiveById(@Param("id") Long id);
}
