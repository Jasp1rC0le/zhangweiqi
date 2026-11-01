package com.campusai.security;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import javax.sql.DataSource;
import static org.assertj.core.api.Assertions.*;

@SpringJUnitConfig(AccountSettingsServiceTest.Config.class)
class AccountSettingsServiceTest {
    @Configuration @EnableTransactionManagement static class Config {
        @Bean DataSource dataSource(){return new DriverManagerDataSource("jdbc:h2:mem:accountsettings;MODE=MySQL;DB_CLOSE_DELAY=-1","sa","");}
        @Bean JdbcTemplate db(DataSource source){return new JdbcTemplate(source);}
        @Bean PasswordEncoder passwords(){return new BCryptPasswordEncoder(4);}
        @Bean PlatformTransactionManager transactions(DataSource source){return new DataSourceTransactionManager(source);}
        @Bean AccountSettingsService settings(JdbcTemplate db,PasswordEncoder passwords){return new AccountSettingsService(db,passwords);}
    }
    @Autowired JdbcTemplate db;@Autowired PasswordEncoder passwords;@Autowired AccountSettingsService service;
    @BeforeEach void setup(){
        db.execute("DROP ALL OBJECTS");db.execute("CREATE TABLE users(id BIGINT PRIMARY KEY,username VARCHAR(50),nickname VARCHAR(50),role VARCHAR(20),school_id BIGINT,status INT,password_hash VARCHAR(255))");
        db.execute("CREATE TABLE auth_sessions(id VARCHAR(36) PRIMARY KEY,user_id BIGINT,revoked_at DATETIME)");
        db.execute("CREATE TABLE account_action_tokens(token_hash VARCHAR(64) PRIMARY KEY,user_id BIGINT,action VARCHAR(24))");
        db.execute("CREATE TABLE account_emails(user_id BIGINT PRIMARY KEY,email VARCHAR(254))");
        db.update("INSERT INTO users VALUES(1,'original-login','旧昵称','STUDENT',1,1,?),(2,'other-login','他人昵称','ADMIN',2,1,?),(3,'disabled','停用账号','STUDENT',1,0,?)",passwords.encode("old-password"),passwords.encode("other-password"),passwords.encode("old-password"));
        db.update("INSERT INTO auth_sessions VALUES('one',1,NULL),('two',1,NULL),('other',2,NULL)");
        db.update("INSERT INTO account_action_tokens VALUES('reset',1,'RESET_PASSWORD'),('verify',1,'VERIFY_EMAIL'),('calendar',1,'CAL_FEED_10'),('other-token',2,'RESET_PASSWORD')");
        db.update("INSERT INTO account_emails VALUES(1,'synthetic@example.test')");
    }
    @Test void nicknameChangesOnlyTheAuthenticatedDisplayNameAndPersistsItsReadback(){
        assertThat(service.nickname(1L,"  新昵称 👩‍🎓  ",()->true).nickname()).isEqualTo("新昵称 👩‍🎓");
        var row=db.queryForMap("SELECT username,role,school_id,nickname FROM users WHERE id=1");
        assertThat(row.get("USERNAME")).isEqualTo("original-login");assertThat(row.get("ROLE")).isEqualTo("STUDENT");assertThat(row.get("SCHOOL_ID")).isEqualTo(1L);
        assertThat(db.queryForObject("SELECT nickname FROM users WHERE id=2",String.class)).isEqualTo("他人昵称");
        assertThat(db.queryForObject("SELECT COUNT(*) FROM auth_sessions WHERE user_id=1 AND revoked_at IS NULL",Integer.class)).isEqualTo(2);
    }
    @Test void invalidNamesMissingUsersAndRevokedSessionsCannotMutate(){
        for(String value:new String[]{" ","a".repeat(51),"中间\n换行"})assertThatThrownBy(()->service.nickname(1L,value,()->true)).hasMessageContaining("400");
        assertThatThrownBy(()->service.nickname(1L,"新昵称",()->false)).hasMessageContaining("401");
        assertThatThrownBy(()->service.nickname(3L,"新昵称",()->true)).hasMessageContaining("401");
        assertThat(db.queryForObject("SELECT nickname FROM users WHERE id=1",String.class)).isEqualTo("旧昵称");
    }
    @Test void passwordChangeRequiresTheCurrentPasswordAndRevokesEveryOldCapabilityButKeepsVerifiedMail(){
        service.password(1L,"old-password","new-password",()->true);
        String hash=db.queryForObject("SELECT password_hash FROM users WHERE id=1",String.class);
        assertThat(passwords.matches("new-password",hash)).isTrue();assertThat(passwords.matches("old-password",hash)).isFalse();
        assertThat(db.queryForObject("SELECT COUNT(*) FROM auth_sessions WHERE user_id=1 AND revoked_at IS NULL",Integer.class)).isZero();
        assertThat(db.queryForObject("SELECT COUNT(*) FROM account_action_tokens WHERE user_id=1",Integer.class)).isZero();
        assertThat(db.queryForObject("SELECT COUNT(*) FROM auth_sessions WHERE user_id=2 AND revoked_at IS NULL",Integer.class)).isEqualTo(1);
        assertThat(db.queryForObject("SELECT COUNT(*) FROM account_action_tokens WHERE user_id=2",Integer.class)).isEqualTo(1);
        assertThat(db.queryForObject("SELECT email FROM account_emails WHERE user_id=1",String.class)).isEqualTo("synthetic@example.test");
    }
    @Test void wrongCurrentSamePasswordOversizedUtf8AndStaleSessionLeaveTheAccountUntouched(){
        assertThatThrownBy(()->service.password(1L,"wrong-password","new-password",()->true)).hasMessageContaining("当前密码不正确");
        assertThatThrownBy(()->service.password(1L,"old-password","old-password",()->true)).hasMessageContaining("不能与当前密码相同");
        assertThatThrownBy(()->service.password(1L,"old-password","密".repeat(25),()->true)).hasMessageContaining("密码过长");
        assertThatThrownBy(()->service.password(1L,"old-password","new-password",()->false)).hasMessageContaining("401");
        assertThat(db.queryForObject("SELECT COUNT(*) FROM auth_sessions WHERE user_id=1 AND revoked_at IS NULL",Integer.class)).isEqualTo(2);
        assertThat(db.queryForObject("SELECT COUNT(*) FROM account_action_tokens WHERE user_id=1",Integer.class)).isEqualTo(3);
        assertThat(passwords.matches("old-password",db.queryForObject("SELECT password_hash FROM users WHERE id=1",String.class))).isTrue();
    }
}
