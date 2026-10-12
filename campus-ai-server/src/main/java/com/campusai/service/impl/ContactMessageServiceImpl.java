package com.campusai.service.impl;

import com.campusai.contact.entity.ContactMessage;
import com.campusai.dto.ContactMessageResponse;
import com.campusai.dto.CreateContactMessageRequest;
import com.campusai.mapper.ContactMessageMapper;
import com.campusai.service.ContactMessageService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@Service
public class ContactMessageServiceImpl implements ContactMessageService {

    private final ContactMessageMapper contactMessageMapper;
    private final com.campusai.mapper.UserMapper users;
    private final long guestSchoolId;

    public ContactMessageServiceImpl(
            ContactMessageMapper contactMessageMapper, com.campusai.mapper.UserMapper users,
            @org.springframework.beans.factory.annotation.Value("${app.contact.school-id:0}") long guestSchoolId) {
        this.contactMessageMapper = contactMessageMapper;
        this.users = users;
        this.guestSchoolId = guestSchoolId;
    }

    @Override
    @Transactional
    public ContactMessageResponse submit(
            CreateContactMessageRequest request, Long userId) {

        ContactMessage contactMessage = new ContactMessage();
        if (userId != null) {
            var user = requireUser(userId, false);
            contactMessage.setUserId(user.getId());
            contactMessage.setSchoolId(user.getSchoolId());
        } else {
            if (guestSchoolId <= 0) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "访客反馈暂未开放，请登录后提交或联系官方邮箱");
            contactMessage.setSchoolId(guestSchoolId);
        }
        contactMessage.setName(request.getName().trim());
        contactMessage.setContact(request.getContact().trim());
        contactMessage.setSubject(request.getSubject().trim());
        contactMessage.setMessage(request.getMessage().trim());
        contactMessage.setStatus("NEW");

        String requestId = request.getRequestId();
        if (requestId != null) {
            if (userId == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "带提交编号的反馈需要登录");
            if (!requestId.matches("(?i)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"))
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "提交编号无效");
            // Lock before checking the receipt, so concurrent retries cannot both insert.
            if (contactMessageMapper.lockUser(userId) == null)
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "没有访问权限");
            ContactMessage existing = contactMessageMapper.findByRequest(userId, requestId);
            if (existing != null) {
                if (!java.util.Objects.equals(existing.getSchoolId(), contactMessage.getSchoolId())
                        || !java.util.Objects.equals(existing.getName(), contactMessage.getName())
                        || !java.util.Objects.equals(existing.getContact(), contactMessage.getContact())
                        || !java.util.Objects.equals(existing.getSubject(), contactMessage.getSubject())
                        || !java.util.Objects.equals(existing.getMessage(), contactMessage.getMessage()))
                    throw new ResponseStatusException(HttpStatus.CONFLICT, "此编号的反馈已接收，但填写内容已变化。请先核对提交结果，不要反复重试");
                return ContactMessageResponse.from(existing);
            }
        }

        if (contactMessageMapper.insert(contactMessage) != 1) {
            throw new IllegalStateException("联系信息保存失败");
        }

        if (requestId != null && contactMessageMapper.insertSubmissionKey(userId, requestId, contactMessage.getId()) != 1)
            throw new IllegalStateException("反馈提交凭据保存失败");

        return ContactMessageResponse.from(
                contactMessageMapper.findById(contactMessage.getId())
        );
    }

    @Override
    public List<ContactMessageResponse> findAll(Long adminId) {
        Long schoolId = requireUser(adminId, true).getSchoolId();
        return contactMessageMapper.findAll(schoolId)
                .stream()
                .map(ContactMessageResponse::from)
                .toList();
    }

    @Override
    @Transactional
    public ContactMessageResponse markHandled(Long id, Long adminId) {
        Long schoolId = requireUser(adminId, true).getSchoolId();
        ContactMessage existing = contactMessageMapper.findById(id);

        if (existing == null || !schoolId.equals(existing.getSchoolId())) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "联系消息不存在"
            );
        }

        contactMessageMapper.markHandled(id, schoolId);
        return ContactMessageResponse.from(
                contactMessageMapper.findById(id)
        );
    }

    private com.campusai.user.entity.User requireUser(Long id, boolean admin) {
        var user = users.findById(id);
        if (user == null || !Integer.valueOf(1).equals(user.getStatus()) || user.getSchoolId() == null
                || (admin && !"ADMIN".equals(user.getRole()))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "没有访问权限");
        }
        return user;
    }
}
