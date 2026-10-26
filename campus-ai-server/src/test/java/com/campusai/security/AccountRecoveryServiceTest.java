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
import java.sql.ResultSet;
import java.util.List;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.annotation.Isolation;

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
        allowActiveUser();
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

    private void allowActiveUser() {
        when(jdbc.queryForList("SELECT id FROM users WHERE id = ? AND status = 1 FOR UPDATE", Long.class, 9L))
                .thenReturn(List.of(9L));
    }

    private AccountRecoveryService configured() {
        when(provider.getIfAvailable()).thenReturn(mock(JavaMailSender.class));
        return new AccountRecoveryService(jdbc, users, passwords, provider,
                "smtp.example.com", "noreply@example.com", "https://campus.example.com");
    }

    @SuppressWarnings({"unchecked", "rawtypes"})
    private void tokenRow(String pendingEmail) throws Exception {
        ResultSet row = mock(ResultSet.class);
        when(row.getLong("user_id")).thenReturn(9L);
        when(row.getString("pending_email")).thenReturn(pendingEmail);
        when(jdbc.query(startsWith("SELECT user_id, pending_email"), any(RowMapper.class), anyString(), anyString()))
                .thenAnswer(call -> List.of(((RowMapper) call.getArgument(1)).mapRow(row, 0)));
        when(jdbc.update(startsWith("UPDATE account_action_tokens SET used_at"), anyString(), anyString())).thenReturn(1);
    }

    @Test
    void verificationRejectsDisabledAccountBeforeConsumingLink() throws Exception {
        tokenRow("new@example.com");
        var service = configured();
        assertThatThrownBy(() -> service.verifyEmail("opaque-token"))
                .isInstanceOf(ResponseStatusException.class);
        verify(jdbc, never()).update(startsWith("UPDATE account_action_tokens SET used_at"), anyString(), anyString());
        verify(jdbc, never()).update(startsWith("INSERT INTO account_emails"), any(), any());
    }

    @Test
    void passwordResetRemembersItsVerifiedRecipient() {
        var service = configured();
        User user = new User(); user.setId(9L); user.setStatus(1);
        when(users.findByUsername("student")).thenReturn(user);
        allowActiveUser();
        when(jdbc.queryForList("SELECT email FROM account_emails WHERE user_id = ? FOR UPDATE", String.class, 9L))
                .thenReturn(List.of("old@example.com"));
        service.requestPasswordReset("student", "Old@Example.com");
        verify(jdbc).update(startsWith("INSERT INTO account_action_tokens (token_hash, user_id, action, pending_email"),
                anyString(), eq(9L), eq("old@example.com"));
    }

    @Test
    void legacyResetWithoutRecipientIsRejected() throws Exception {
        tokenRow(null); allowActiveUser();
        var service = configured();
        assertThatThrownBy(() -> service.resetPassword("opaque-token", "new-password"))
                .isInstanceOf(ResponseStatusException.class);
        verify(passwords, never()).encode(any());
    }

    @Test
    void resetRecipientMustStillMatchCurrentMailbox() throws Exception {
        tokenRow("old@example.com"); allowActiveUser();
        when(jdbc.queryForList("SELECT email FROM account_emails WHERE user_id = ? FOR UPDATE", String.class, 9L))
                .thenReturn(List.of("new@example.com"));
        var service = configured();
        assertThatThrownBy(() -> service.resetPassword("opaque-token", "new-password"))
                .isInstanceOf(ResponseStatusException.class);
        verify(passwords, never()).encode(any());
    }

    @Test
    void verifiedMailboxChangeDeletesAllOlderResetLinks() throws Exception {
        tokenRow("new@example.com"); allowActiveUser();
        configured().verifyEmail("opaque-token");
        verify(jdbc).update("DELETE FROM account_action_tokens WHERE user_id = ? AND action = 'RESET_PASSWORD'", 9L);
    }

    @Test
    void passwordResetDeletesPendingMailboxChangeLinks() throws Exception {
        tokenRow("current@example.com"); allowActiveUser();
        when(jdbc.queryForList("SELECT email FROM account_emails WHERE user_id = ? FOR UPDATE", String.class, 9L))
                .thenReturn(List.of("current@example.com"));
        when(passwords.encode("new-password")).thenReturn("encoded");
        when(jdbc.update("UPDATE users SET password_hash = ? WHERE id = ? AND status = 1", "encoded", 9L)).thenReturn(1);
        configured().resetPassword("opaque-token", "new-password");
        verify(jdbc).update("DELETE FROM account_action_tokens WHERE user_id = ? AND action = 'VERIFY_EMAIL'", 9L);
    }

    @Test
    void allTokenWritersHaveOneTransactionalBoundary() throws Exception {
        for (String name : List.of("requestEmailVerification", "verifyEmail", "requestPasswordReset", "resetPassword")) {
            var method = java.util.Arrays.stream(AccountRecoveryService.class.getMethods()).filter(m -> m.getName().equals(name)).findFirst().orElseThrow();
            var transaction = method.getAnnotation(Transactional.class);
            assertThat(transaction).isNotNull();
            assertThat(transaction.isolation()).isEqualTo(Isolation.READ_COMMITTED);
        }
    }
}
