package com.campusai.security;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.nio.charset.StandardCharsets;
import java.util.function.BooleanSupplier;

@Service
public class AccountSettingsService {
    private final JdbcTemplate db;
    private final PasswordEncoder passwords;
    public record Nickname(String nickname) {}
    public AccountSettingsService(JdbcTemplate db,PasswordEncoder passwords){this.db=db;this.passwords=passwords;}
    private void lock(Long user,BooleanSupplier session){
        if(user==null || db.queryForList("SELECT id FROM users WHERE id=? AND status=1 FOR UPDATE",Long.class,user).isEmpty())
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,"账号不可用，请重新登录");
        if(!session.getAsBoolean())throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,"登录状态已变化，请重新登录");
    }
    @Transactional(isolation=Isolation.READ_COMMITTED)
    public Nickname nickname(Long user,String raw,BooleanSupplier session){
        String value=raw==null?"":raw.strip();
        if(value.isEmpty() || value.length()>50 || value.codePoints().anyMatch(Character::isISOControl))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"昵称须为1至50个字符，不能包含换行或控制字符");
        lock(user,session);
        db.update("UPDATE users SET nickname=? WHERE id=? AND status=1",value,user);
        return new Nickname(db.queryForObject("SELECT nickname FROM users WHERE id=?",String.class,user));
    }
    @Transactional(isolation=Isolation.READ_COMMITTED)
    public void password(Long user,String current,String next,BooleanSupplier session){
        AccountPasswordPolicy.validateNew(next);
        if(current==null || current.isBlank() || current.length()>72 || current.getBytes(StandardCharsets.UTF_8).length>72)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"当前密码不正确");
        lock(user,session);
        String encoded=db.queryForObject("SELECT password_hash FROM users WHERE id=?",String.class,user);
        if(!passwords.matches(current,encoded))throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"当前密码不正确");
        if(passwords.matches(next,encoded))throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"新密码不能与当前密码相同");
        if(db.update("UPDATE users SET password_hash=? WHERE id=? AND status=1",passwords.encode(next),user)!=1)
            throw new ResponseStatusException(HttpStatus.CONFLICT,"密码状态已变化，请重新核对");
        db.update("UPDATE auth_sessions SET revoked_at=NOW() WHERE user_id=? AND revoked_at IS NULL",user);
        // Recovery, pending mailbox changes and private calendar capabilities cannot undo a password change.
        db.update("DELETE FROM account_action_tokens WHERE user_id=?",user);
    }
}
