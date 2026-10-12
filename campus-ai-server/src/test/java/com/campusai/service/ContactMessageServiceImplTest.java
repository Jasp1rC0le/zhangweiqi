package com.campusai.service;

import com.campusai.contact.entity.ContactMessage;
import com.campusai.dto.ContactMessageResponse;
import com.campusai.dto.CreateContactMessageRequest;
import com.campusai.mapper.ContactMessageMapper;
import com.campusai.service.impl.ContactMessageServiceImpl;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ContactMessageServiceImplTest {

    @Mock
    private ContactMessageMapper mapper;
    @Mock private com.campusai.mapper.UserMapper users;

    @Test
    void shouldTrimAndSavePublicContactMessage() {
        ContactMessageService service = new ContactMessageServiceImpl(mapper, users, 1L);
        CreateContactMessageRequest request = new CreateContactMessageRequest();
        request.setName("  张同学  ");
        request.setContact("  13800000000  ");
        request.setSubject("  产品建议  ");
        request.setMessage("  希望增加课程查询  ");

        when(mapper.insert(any(ContactMessage.class))).thenAnswer(invocation -> {
            ContactMessage message = invocation.getArgument(0);
            message.setId(9L);
            return 1;
        });
        when(mapper.findById(9L)).thenAnswer(invocation -> {
            ContactMessage message = new ContactMessage();
            message.setId(9L);
            message.setName("张同学");
            message.setContact("13800000000");
            message.setSubject("产品建议");
            message.setMessage("希望增加课程查询");
            message.setStatus("NEW");
            message.setCreatedAt(LocalDateTime.now());
            return message;
        });

        ContactMessageResponse response = service.submit(request, null);

        ArgumentCaptor<ContactMessage> captor =
                ArgumentCaptor.forClass(ContactMessage.class);
        verify(mapper).insert(captor.capture());
        assertThat(captor.getValue().getName()).isEqualTo("张同学");
        assertThat(captor.getValue().getContact()).isEqualTo("13800000000");
        assertThat(captor.getValue().getStatus()).isEqualTo("NEW");
        assertThat(captor.getValue().getSchoolId()).isEqualTo(1L);
        assertThat(captor.getValue().getUserId()).isNull();
        assertThat(response.getId()).isEqualTo(9L);
    }

    @Test
    void shouldReturnNotFoundWhenContactMessageDoesNotExist() {
        ContactMessageService service = new ContactMessageServiceImpl(mapper, users, 1L);
        when(users.findById(7L)).thenReturn(user(7L,1L,"ADMIN"));
        when(mapper.findById(404L)).thenReturn(null);

        assertThatThrownBy(() -> service.markHandled(404L,7L))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("联系消息不存在");
    }

    private com.campusai.user.entity.User user(Long id,Long school,String role) {
        var user=new com.campusai.user.entity.User();user.setId(id);user.setSchoolId(school);user.setRole(role);user.setStatus(1);return user;
    }

    @Test void signedInFeedbackIsBoundToServerIdentity() {
        when(users.findById(8L)).thenReturn(user(8L,2L,"STUDENT"));
        when(mapper.insert(any())).thenAnswer(call->{ContactMessage row=call.getArgument(0);row.setId(10L);return 1;});
        when(mapper.findById(10L)).thenReturn(new ContactMessage());
        var request=new CreateContactMessageRequest();request.setName("同学");request.setContact("");request.setSubject("建议");request.setMessage("正文");
        new ContactMessageServiceImpl(mapper,users,1L).submit(request,8L);
        var row=ArgumentCaptor.forClass(ContactMessage.class);verify(mapper).insert(row.capture());
        assertThat(row.getValue().getUserId()).isEqualTo(8L);
        assertThat(row.getValue().getSchoolId()).isEqualTo(2L);
    }

    @Test void adminCannotReadOrHandleOtherSchoolFeedbackAndGuestNeedsExplicitRouting() {
        var service=new ContactMessageServiceImpl(mapper,users,0);
        when(users.findById(7L)).thenReturn(user(7L,1L,"ADMIN"));
        when(mapper.findAll(1L)).thenReturn(java.util.List.of());
        assertThat(service.findAll(7L)).isEmpty();
        var other=new ContactMessage();other.setSchoolId(2L);
        when(mapper.findById(9L)).thenReturn(other);
        assertThatThrownBy(()->service.markHandled(9L,7L)).hasMessageContaining("404");
        org.mockito.Mockito.verify(mapper,org.mockito.Mockito.never()).markHandled(any(),any());
        assertThatThrownBy(()->service.submit(new CreateContactMessageRequest(),null)).hasMessageContaining("503");
    }
}
