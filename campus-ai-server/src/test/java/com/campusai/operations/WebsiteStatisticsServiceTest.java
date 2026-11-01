package com.campusai.operations;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import java.time.*;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class WebsiteStatisticsServiceTest {
    JdbcTemplate db;
    WebsiteStatisticsService service;
    @BeforeEach void setup(){
        db=new JdbcTemplate(new DriverManagerDataSource("jdbc:h2:mem:"+UUID.randomUUID()+";MODE=MySQL;DB_CLOSE_DELAY=-1","sa",""));
        db.execute("CREATE TABLE users(id BIGINT PRIMARY KEY,school_id BIGINT,status INT,created_at DATETIME)");
        db.execute("CREATE TABLE ai_model_usage(user_id BIGINT,created_at DATETIME)");
        db.execute("CREATE TABLE campus_merchant_ratings(user_id BIGINT,school_id BIGINT,updated_at DATETIME)");
        db.execute("CREATE TABLE campus_merchant_reviews(id BIGINT PRIMARY KEY,user_id BIGINT,school_id BIGINT,created_at DATETIME)");
        db.execute("CREATE TABLE campus_review_likes(user_id BIGINT,review_id BIGINT,created_at DATETIME)");
        db.execute("CREATE TABLE student_timetables(user_id BIGINT,imported_at TIMESTAMP)");
        db.execute("CREATE TABLE student_course_schedules(user_id BIGINT,imported_at TIMESTAMP)");
        db.execute("CREATE TABLE campus_wall_entries(id VARCHAR(36) PRIMARY KEY,user_id BIGINT,school_id BIGINT,created_at DATETIME)");
        db.execute("CREATE TABLE campus_wall_likes(user_id BIGINT,entry_id VARCHAR(36),created_at DATETIME)");
        db.execute("CREATE TABLE student_projects(user_id BIGINT,updated_at DATETIME)");
        db.execute("CREATE TABLE ai_message_feedback(id BIGINT PRIMARY KEY,user_id BIGINT,helpful INT,updated_at DATETIME)");
        db.execute("CREATE TABLE ai_feedback_resolutions(feedback_id BIGINT,resolved_at DATETIME)");
        db.execute("CREATE TABLE contact_messages(school_id BIGINT,status VARCHAR(20),created_at DATETIME)");
        db.update("INSERT INTO users VALUES(1,1,1,'2026-10-01 10:00:00'),(2,1,1,'2026-10-31 10:00:00'),(3,1,0,'2026-11-01 10:00:00'),(4,2,1,'2026-11-01 10:00:00')");
        service=new WebsiteStatisticsService(db,Clock.fixed(Instant.parse("2026-11-01T06:00:00Z"),ZoneOffset.UTC));
    }
    private long participants(WebsiteStatisticsService.Statistics data,String code){return data.features().stream().filter(row->row.code().equals(code)).findFirst().orElseThrow().participants();}
    @Test void countsCurrentSchoolAccountsAndDeduplicatesParticipantsAcrossFeaturesAndSources(){
        db.update("INSERT INTO ai_model_usage VALUES(1,'2026-11-01 12:00:00'),(1,'2026-11-01 12:01:00'),(3,'2026-11-01 12:00:00'),(4,'2026-11-01 12:00:00')");
        db.update("INSERT INTO campus_merchant_ratings VALUES(1,1,'2026-10-31 12:00:00'),(2,2,'2026-10-31 12:00:00')");
        db.update("INSERT INTO campus_merchant_reviews VALUES(11,1,1,'2026-10-31 12:00:00'),(22,4,2,'2026-10-31 12:00:00')");
        db.update("INSERT INTO campus_review_likes VALUES(2,11,'2026-11-01 12:00:00'),(2,22,'2026-11-01 12:00:00')");
        db.update("INSERT INTO student_timetables VALUES(1,'2026-10-30 12:00:00')");db.update("INSERT INTO student_course_schedules VALUES(1,'2026-10-30 12:00:00')");
        db.update("INSERT INTO campus_wall_entries VALUES('one',2,1,'2026-10-31 12:00:00'),('foreign',4,2,'2026-10-31 12:00:00')");
        db.update("INSERT INTO campus_wall_likes VALUES(2,'one','2026-11-01 12:00:00'),(1,'foreign','2026-11-01 12:00:00')");
        db.update("INSERT INTO student_projects VALUES(1,'2026-11-01 12:00:00')");
        var data=service.read(1L,7);
        assertThat(data.totalAccounts()).isEqualTo(2);assertThat(data.newAccounts()).isEqualTo(1);assertThat(data.participatingAccounts()).isEqualTo(2);
        assertThat(participants(data,"QUESTION")).isEqualTo(1);assertThat(participants(data,"CANTEEN")).isEqualTo(2);
        assertThat(participants(data,"TIMETABLE")).isEqualTo(1);assertThat(participants(data,"WALL")).isEqualTo(1);assertThat(participants(data,"PROJECT")).isEqualTo(1);
        assertThat(data.daily()).hasSize(7);assertThat(data.from()).isEqualTo(LocalDate.of(2026,10,26));assertThat(data.to()).isEqualTo(LocalDate.of(2026,11,1));
        assertThat(data.daily().stream().mapToLong(WebsiteStatisticsService.Day::newAccounts).sum()).isEqualTo(data.newAccounts());
    }
    @Test void thirtyDayWindowUsesRealOlderRecordsAndKeepsEmptyDatesAsObservedZeros(){
        db.update("INSERT INTO users VALUES(5,1,1,'2026-10-10 10:00:00')");db.update("INSERT INTO ai_model_usage VALUES(5,'2026-10-10 11:00:00')");
        var week=service.read(1L,7);var month=service.read(1L,30);
        assertThat(week.newAccounts()).isEqualTo(1);assertThat(month.newAccounts()).isEqualTo(2);
        assertThat(week.participatingAccounts()).isZero();assertThat(month.participatingAccounts()).isEqualTo(1);
        assertThat(month.daily()).hasSize(30);assertThat(month.from()).isEqualTo(LocalDate.of(2026,10,3));
        assertThat(month.daily().get(0).newAccounts()).isZero();assertThat(month.daily().stream().mapToLong(WebsiteStatisticsService.Day::newAccounts).sum()).isEqualTo(2);
    }
    @Test void beijingWindowIncludesItsStartAndExcludesTheReadInstantAndEarlierRecords(){
        db.update("INSERT INTO users VALUES(5,1,1,'2026-10-26 00:00:00'),(6,1,1,'2026-11-01 14:00:00'),(7,1,1,'2026-10-25 23:59:59')");
        db.update("INSERT INTO ai_model_usage VALUES(1,'2026-10-26 00:00:00'),(2,'2026-11-01 14:00:00'),(2,'2026-10-25 23:59:59')");
        var data=service.read(1L,7);assertThat(data.newAccounts()).isEqualTo(2);assertThat(data.participatingAccounts()).isEqualTo(1);
        assertThat(data.asOf()).isEqualTo(Instant.parse("2026-11-01T06:00:00Z"));assertThat(data.timeZone()).isEqualTo("Asia/Shanghai");
    }
    @Test void improvementSignalsRespectSchoolStatusResolutionAndPeriod(){
        db.update("INSERT INTO ai_message_feedback VALUES(1,1,0,'2026-11-01 12:00:00'),(2,2,0,'2026-11-01 12:00:00'),(3,3,0,'2026-11-01 12:00:00'),(4,4,0,'2026-11-01 12:00:00'),(5,1,1,'2026-11-01 12:00:00'),(6,1,0,'2026-10-01 12:00:00')");
        db.update("INSERT INTO ai_feedback_resolutions VALUES(2,'2026-11-01 13:00:00')");
        db.update("INSERT INTO contact_messages VALUES(1,'NEW','2026-11-01 12:00:00'),(1,'NEW','2026-10-31 12:00:00'),(2,'NEW','2026-11-01 12:00:00'),(1,'HANDLED','2026-11-01 12:00:00'),(1,'NEW','2026-10-01 12:00:00')");
        var data=service.read(1L,7);assertThat(data.unhelpfulFeedback()).isEqualTo(1);assertThat(data.openContacts()).isEqualTo(2);
        assertThat(participants(data,"QUESTION")).isEqualTo(2);assertThat(data.participatingAccounts()).isEqualTo(2);
    }
    @Test void emptySchoolHasRealZeroCountsAndInvalidScopesNeverQuery(){
        var data=service.read(9L,7);assertThat(data.totalAccounts()).isZero();assertThat(data.features()).allSatisfy(row->assertThat(row.participants()).isZero());
        var mock=mock(JdbcTemplate.class);var isolated=new WebsiteStatisticsService(mock,Clock.systemUTC());
        assertThatThrownBy(()->isolated.read(null,7)).hasMessageContaining("403");assertThatThrownBy(()->isolated.read(1L,365)).hasMessageContaining("400");verifyNoInteractions(mock);
    }
}
