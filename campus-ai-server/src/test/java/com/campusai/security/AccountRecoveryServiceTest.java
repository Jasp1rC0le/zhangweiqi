package com.campusai.security;

import com.campusai.mapper.UserMapper;
import com.campusai.user.entity.User;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.mail.SimpleMailMessage;

import org.mockito.ArgumentCaptor;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

class AccountRecoveryServiceTest {
    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final UserMapper users = mock(UserMapper.class);
    private final PasswordEncoder passwords = mock(PasswordEncoder.class);
    @SuppressWarnings("unchecked")
    private final ObjectProvider<JavaMailSender> provider = mock(ObjectProvider.class);

    @Test
    void refusesToClaimMailWasSentWhenSmtpIsNotConfigured() {
        var service = new AccountRecoveryService(jdbc, users, passwords, provider,
                "", "", "http://localhost:5173");

        assertThatThrownBy(() -> service.requestPasswordReset("student", "a@example.com"))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(error -> assertThat(((ResponseStatusException) error).getStatusCode())
                        .isEqualTo(HttpStatus.SERVICE_UNAVAILABLE));
        verifyNoInteractions(jdbc, users);
    }

    @Test
    void unknownAccountHasSamePublicResultWithoutSendingMail() {
        JavaMailSender sender = mock(JavaMailSender.class);
        when(provider.getIfAvailable()).thenReturn(sender);
        var service = new AccountRecoveryService(jdbc, users, passwords, provider,
                "smtp.example.com", "noreply@example.com", "https://campus.example.com");

        service.requestPasswordReset("missing", "a@example.com");

        verify(users).findByUsername("missing");
        verifyNoInteractions(sender, jdbc);
    }

    @Test
    void verificationEmailContainsOpaqueLinkAndDatabaseGetsOnlyHash() {
        JavaMailSender sender = mock(JavaMailSender.class);
        when(provider.getIfAvailable()).thenReturn(sender);
        User user = new User();
        user.setId(9L);
        user.setStatus(1);
        user.setPasswordHash("stored-hash");
        when(users.findById(9L)).thenReturn(user);
        when(passwords.matches("current-password", "stored-hash")).thenReturn(true);
        var service = new AccountRecoveryService(jdbc, users, passwords, provider,
                "smtp.example.com", "noreply@example.com", "https://campus.example.com");

        service.requestEmailVerification(9L, "Student@Example.com", "current-password");

        ArgumentCaptor<SimpleMailMessage> mail = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(sender).send(mail.capture());
        assertThat(mail.getValue().getTo()).containsExactly("student@example.com");
        assertThat(mail.getValue().getText()).contains("/verify-email#token=");
        verify(jdbc).update(org.mockito.ArgumentMatchers.contains("INSERT INTO account_action_tokens"),
                org.mockito.ArgumentMatchers.argThat(value -> value instanceof String
                        && ((String) value).length() == 64),
                org.mockito.ArgumentMatchers.eq(9L),
                org.mockito.ArgumentMatchers.eq("student@example.com"));
    }
}
