package com.campusai.service;

import com.campusai.dto.ContactMessageResponse;
import com.campusai.dto.CreateContactMessageRequest;

import java.util.List;

public interface ContactMessageService {

    ContactMessageResponse submit(CreateContactMessageRequest request, Long userId);

    List<ContactMessageResponse> findAll(Long adminId);

    ContactMessageResponse markHandled(Long id, Long adminId);
}
