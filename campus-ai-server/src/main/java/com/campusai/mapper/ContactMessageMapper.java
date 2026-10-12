package com.campusai.mapper;

import com.campusai.contact.entity.ContactMessage;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface ContactMessageMapper {

    int insert(ContactMessage contactMessage);

    Long lockUser(@Param("userId") Long userId);

    ContactMessage findByRequest(@Param("userId") Long userId, @Param("requestId") String requestId);

    int insertSubmissionKey(@Param("userId") Long userId, @Param("requestId") String requestId, @Param("messageId") Long messageId);

    ContactMessage findById(@Param("id") Long id);

    List<ContactMessage> findAll(@Param("schoolId") Long schoolId);

    int markHandled(@Param("id") Long id, @Param("schoolId") Long schoolId);
}
