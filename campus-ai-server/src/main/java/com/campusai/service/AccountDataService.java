package com.campusai.service;

import com.campusai.exception.UnauthorizedException;
import com.campusai.mapper.UserMapper;
import com.campusai.user.entity.User;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.LinkedHashMap;
import java.util.Map;

@Service
public class AccountDataService {
    private final JdbcTemplate jdbc;
    private final UserMapper users;
    private final PasswordEncoder passwords;

    public AccountDataService(JdbcTemplate jdbc, UserMapper users, PasswordEncoder passwords) {
        this.jdbc = jdbc;
        this.users = users;
        this.passwords = passwords;
    }

    public Map<String, Object> export(Long userId) {
        User user = requireUser(userId);
        Map<String, Object> result = new LinkedHashMap<>();
        Map<String, Object> profile = new LinkedHashMap<>();
        profile.put("id", user.getId()); profile.put("username", user.getUsername());
        profile.put("nickname", user.getNickname()); profile.put("schoolId", user.getSchoolId());
        profile.put("role", user.getRole()); result.put("profile", profile);
        result.put("verifiedEmail", jdbc.queryForList(
                "SELECT email FROM account_emails WHERE user_id = ?", String.class, userId));
        result.put("privacyConsent", jdbc.queryForList(
                "SELECT policy_version, accepted_at FROM user_privacy_consents WHERE user_id = ?", userId));
        result.put("personalizationProfile", jdbc.queryForList("SELECT major, grade, skills_json, "
                + "career_direction, bio, updated_at FROM user_profiles WHERE user_id = ?", userId));
        result.put("timetable", jdbc.query("SELECT revision,semester,first_monday,start_week,end_week,remind_days,"
                + "image_mime,image_bytes,imported_at,checked_at FROM student_timetables WHERE user_id = ?", (rs, n) -> {
            Map<String,Object> timetable = new LinkedHashMap<>();
            timetable.put("revision", rs.getInt("revision")); timetable.put("semester", rs.getString("semester"));
            timetable.put("firstMonday", rs.getDate("first_monday").toString());
            timetable.put("startWeek", rs.getInt("start_week")); timetable.put("endWeek", rs.getInt("end_week"));
            timetable.put("remindDays", rs.getInt("remind_days")); timetable.put("imageMime", rs.getString("image_mime"));
            timetable.put("imageBase64", java.util.Base64.getEncoder().encodeToString(rs.getBytes("image_bytes")));
            timetable.put("importedAt", rs.getTimestamp("imported_at").toInstant().toString());
            timetable.put("checkedAt", rs.getTimestamp("checked_at").toInstant().toString());
            return timetable;
        }, userId));
        result.put("courseSchedule", jdbc.queryForList("SELECT revision,semester,first_monday,remind_days,courses_json,imported_at,checked_at "
                + "FROM student_course_schedules WHERE user_id = ?", userId));
        result.put("conversations", jdbc.queryForList("SELECT id, title, model, created_at, updated_at "
                + "FROM ai_conversations WHERE user_id = ? ORDER BY id", userId));
        result.put("messages", jdbc.queryForList("SELECT message.id, message.conversation_id, "
                + "message.role, message.content, message.created_at FROM ai_messages message "
                + "JOIN ai_conversations conversation ON conversation.id = message.conversation_id "
                + "WHERE conversation.user_id = ? ORDER BY message.id", userId));
        result.put("feedback", jdbc.queryForList("SELECT message_id, helpful, reason, created_at "
                + "FROM ai_message_feedback WHERE user_id = ? ORDER BY id", userId));
        result.put("submissions", jdbc.queryForList("SELECT question, content, source_url, status, "
                + "review_note, created_at FROM knowledge_submissions WHERE user_id = ? ORDER BY id", userId));
        result.put("contactMessages", jdbc.queryForList("SELECT name, contact, subject, message, "
                + "status, created_at FROM contact_messages WHERE user_id = ? ORDER BY id", userId));
        result.put("modelUsage", jdbc.queryForList("SELECT provider, model, prompt_tokens, "
                + "completion_tokens, total_tokens, created_at FROM ai_model_usage "
                + "WHERE user_id = ? ORDER BY id", userId));
        result.put("projects", jdbc.queryForList("SELECT id, title, track, revision, archived, content_json, "
                + "created_at, updated_at FROM student_projects WHERE user_id = ? ORDER BY id", userId));
        result.put("projectVersions", jdbc.queryForList("SELECT v.project_id, v.revision, v.content_json, v.created_at "
                + "FROM student_project_versions v JOIN student_projects p ON p.id = v.project_id "
                + "WHERE p.user_id = ? ORDER BY v.project_id, v.revision", userId));
        result.put("canteenRatings", jdbc.queryForList("SELECT merchant_id, score, created_at, updated_at "
                + "FROM campus_merchant_ratings WHERE user_id = ? ORDER BY id", userId));
        result.put("canteenReviews", jdbc.queryForList("SELECT merchant_id, comment_text, status, created_at, updated_at "
                + "FROM campus_merchant_reviews WHERE user_id = ? ORDER BY id", userId));
        result.put("canteenReviewLikes", jdbc.queryForList("SELECT review_id, created_at FROM campus_review_likes WHERE user_id = ? ORDER BY created_at", userId));
        result.put("outgoingProjectReviews", jdbc.queryForList("SELECT id,project_id,revision,includes_material,includes_data,title,snapshot_json,review_note,expires_at,revoked_at "
                + "FROM project_reviews WHERE owner_id = ? ORDER BY created_at", userId));
        result.put("myProjectReviewNotes", jdbc.queryForList("SELECT id,title,revision,review_note,reviewed_at "
                + "FROM project_reviews WHERE recipient_id = ? ORDER BY created_at", userId));
        result.put("tokenAccounting", jdbc.queryForList("SELECT usage_date,reserved_tokens,actual_tokens,state,created_at,updated_at FROM ai_token_reservations WHERE user_id = ? ORDER BY created_at",userId));
        result.put("campusWallEntries", jdbc.queryForList("SELECT id,parent_id,category,title,body,status,review_note,created_at FROM campus_wall_entries WHERE user_id = ? ORDER BY created_at",userId));
        result.put("campusWallLikes", jdbc.queryForList("SELECT entry_id,created_at FROM campus_wall_likes WHERE user_id = ?",userId));
        result.put("campusWallReports", jdbc.queryForList("SELECT entry_id,reason,resolved,created_at FROM campus_wall_reports WHERE user_id = ?",userId));
        return result;
    }

    @Transactional
    public void delete(Long userId, String password) {
        User user = requireUser(userId);
        if ("ADMIN".equals(user.getRole())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "管理员账户需先移交审核记录后再注销");
        }
        if (password == null || !passwords.matches(password, user.getPasswordHash())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "密码不正确");
        }
        jdbc.update("DELETE FROM contact_messages WHERE user_id = ?", userId);
        jdbc.update("DELETE FROM knowledge_submissions WHERE user_id = ?", userId);
        jdbc.update("DELETE FROM ai_model_usage WHERE user_id = ?", userId);
        jdbc.update("DELETE FROM ai_conversations WHERE user_id = ?", userId);
        jdbc.update("DELETE FROM users WHERE id = ?", userId);
    }

    private User requireUser(Long userId) {
        User user = users.findById(userId);
        if (user == null || user.getStatus() == null || user.getStatus() != 1) {
            throw new UnauthorizedException("账户不存在或已停用");
        }
        return user;
    }
}
