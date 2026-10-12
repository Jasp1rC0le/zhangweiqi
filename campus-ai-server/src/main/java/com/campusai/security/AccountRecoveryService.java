package com.campusai.security;

import com.campusai.mapper.UserMapper;
import com.campusai.user.entity.User;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mail.MailException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;

@Service
public class AccountRecoveryService {
    private final JdbcTemplate jdbc;
    private final UserMapper users;
    private final PasswordEncoder passwords;
    private final ObjectProvider<JavaMailSender> mailSender;
    private final String smtpHost;
    private final String mailFrom;
    private final String webUrl;
    private final SecureRandom random = new SecureRandom();

    public AccountRecoveryService(JdbcTemplate jdbc, UserMapper users, PasswordEncoder passwords,
            ObjectProvider<JavaMailSender> mailSender,
            @Value("${spring.mail.host:}") String smtpHost,
            @Value("${app.auth.mail-from:}") String mailFrom,
            @Value("${app.auth.public-web-url:http://localhost:5173}") String webUrl) {
        this.jdbc = jdbc;
        this.users = users;
        this.passwords = passwords;
        this.mailSender = mailSender;
        this.smtpHost = smtpHost;
        this.mailFrom = mailFrom;
        this.webUrl = webUrl.replaceAll("/+$", "");
    }

    public String verifiedEmail(Long userId) {
        List<String> rows = jdbc.queryForList("SELECT email FROM account_emails WHERE user_id = ?",
                String.class, userId);
        return rows.isEmpty() ? null : rows.get(0);
    }

    public void requestEmailVerification(Long userId, String rawEmail, String password) {
        JavaMailSender sender = requireMail();
        User user = users.findById(userId);
        if (user == null || user.getStatus() == null || user.getStatus() != 1
                || password == null || !passwords.matches(password, user.getPasswordHash())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "密码不正确");
        }
        String email = rawEmail.trim().toLowerCase(Locale.ROOT);
        List<Long> existing = jdbc.queryForList(
                "SELECT user_id FROM account_emails WHERE email = ?", Long.class, email);
        if (!existing.isEmpty() && !existing.get(0).equals(userId)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "该邮箱已被使用");
        }
        String token = newToken();
        jdbc.update("DELETE FROM account_action_tokens WHERE user_id = ? AND action = 'VERIFY_EMAIL'", userId);
        jdbc.update("INSERT INTO account_action_tokens (token_hash, user_id, action, pending_email, expires_at) "
                + "VALUES (?, ?, 'VERIFY_EMAIL', ?, NOW() + INTERVAL 30 MINUTE)", hash(token), userId, email);
        send(sender, email, "验证 Campthink 邮箱", "你正在为 Campthink 账号绑定找回邮箱，请在30分钟内打开以下链接：\n"
                + webUrl + "/verify-email#token=" + token
                + "\n\n请勿转发此链接。若非本人操作，请忽略本邮件；未点击验证不会完成邮箱绑定。", token);
    }

    @Transactional
    public void verifyEmail(String rawToken) {
        TokenRow row = consume(rawToken, "VERIFY_EMAIL");
        try {
            int changed = jdbc.update("UPDATE account_emails SET email = ?, verified_at = NOW() "
                    + "WHERE user_id = ?", row.pendingEmail(), row.userId());
            if (changed == 0) {
                jdbc.update("INSERT INTO account_emails (user_id, email, verified_at) "
                        + "VALUES (?, ?, NOW())", row.userId(), row.pendingEmail());
            }
        } catch (DataIntegrityViolationException exception) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "该邮箱已被其他账户使用");
        }
    }

    public void requestPasswordReset(String username, String rawEmail) {
        JavaMailSender sender = requireMail();
        User user = users.findByUsername(username.trim());
        if (user == null || user.getStatus() == null || user.getStatus() != 1) return;
        String email = rawEmail.trim().toLowerCase(Locale.ROOT);
        if (!email.equals(verifiedEmail(user.getId()))) return;
        String token = newToken();
        jdbc.update("DELETE FROM account_action_tokens WHERE user_id = ? AND action = 'RESET_PASSWORD'",
                user.getId());
        jdbc.update("INSERT INTO account_action_tokens (token_hash, user_id, action, expires_at) "
                + "VALUES (?, ?, 'RESET_PASSWORD', NOW() + INTERVAL 20 MINUTE)", hash(token), user.getId());
        send(sender, email, "重置 Campthink 密码", "你申请了 Campthink 密码重置，请在20分钟内打开以下链接：\n"
                + webUrl + "/reset-password#token=" + token
                + "\n\n请勿转发此链接。若非本人操作，请忽略本邮件；未确认重置不会更改密码。", token);
    }

    @Transactional
    public void resetPassword(String token, String newPassword) {
        if (newPassword == null || newPassword.length() < 6 || newPassword.length() > 72) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "密码须为6至72个字符");
        }
        TokenRow row = consume(token, "RESET_PASSWORD");
        int changed = jdbc.update("UPDATE users SET password_hash = ? WHERE id = ? AND status = 1",
                passwords.encode(newPassword), row.userId());
        if (changed != 1) throw invalid();
        jdbc.update("UPDATE auth_sessions SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL",
                row.userId());
    }

    private TokenRow consume(String rawToken, String action) {
        if (rawToken == null || rawToken.isBlank() || rawToken.length() > 128) throw invalid();
        List<TokenRow> rows = jdbc.query("SELECT user_id, pending_email FROM account_action_tokens "
                + "WHERE token_hash = ? AND action = ? AND used_at IS NULL AND expires_at > NOW()",
                (rs, index) -> new TokenRow(rs.getLong("user_id"), rs.getString("pending_email")),
                hash(rawToken), action);
        if (rows.isEmpty()) throw invalid();
        int changed = jdbc.update("UPDATE account_action_tokens SET used_at = NOW() "
                + "WHERE token_hash = ? AND action = ? AND used_at IS NULL AND expires_at > NOW()",
                hash(rawToken), action);
        if (changed != 1) throw invalid();
        return rows.get(0);
    }

    private JavaMailSender requireMail() {
        JavaMailSender sender = mailSender.getIfAvailable();
        if (smtpHost.isBlank() || mailFrom.isBlank() || sender == null) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "邮箱服务尚未配置，请联系管理员");
        }
        return sender;
    }

    private void send(JavaMailSender sender, String email, String subject, String body, String token) {
        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(mailFrom);
        message.setTo(email);
        message.setSubject(subject);
        message.setText(body);
        try {
            sender.send(message);
        } catch (MailException exception) {
            jdbc.update("DELETE FROM account_action_tokens WHERE token_hash = ?", hash(token));
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "邮件发送失败，请稍后再试");
        }
    }

    private String newToken() {
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private String hash(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) { throw new IllegalStateException(exception); }
    }

    private ResponseStatusException invalid() {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, "验证链接无效或已过期");
    }

    private record TokenRow(Long userId, String pendingEmail) {}
}
