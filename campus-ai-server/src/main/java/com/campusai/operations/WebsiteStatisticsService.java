package com.campusai.operations;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.sql.Timestamp;
import java.time.*;
import java.util.*;

/** Aggregate existing records only; no page tracking, private payload reads or schema changes. */
@Service
public class WebsiteStatisticsService {
    private static final ZoneId ZONE=ZoneId.of("Asia/Shanghai");
    private final JdbcTemplate jdbc;
    private final Clock clock;
    public record Feature(String code,long participants) {}
    public record Day(LocalDate date,long newAccounts) {}
    public record Statistics(int days,LocalDate from,LocalDate to,Instant asOf,String timeZone,String coverage,
                             long totalAccounts,long newAccounts,long participatingAccounts,List<Feature> features,
                             List<Day> daily,long unhelpfulFeedback,long openContacts) {}
    @Autowired public WebsiteStatisticsService(JdbcTemplate jdbc){this(jdbc,Clock.systemUTC());}
    public WebsiteStatisticsService(JdbcTemplate jdbc,Clock clock){this.jdbc=jdbc;this.clock=clock;}

    private static String source(String feature,String from,String user,String at,String schoolCheck){
        return "SELECT '"+feature+"' AS feature,"+user+" AS participant_id FROM "+from
                +" JOIN users account ON account.id="+user+" WHERE account.school_id=? AND account.status=1 AND "+at+">=? AND "+at+"<?"
                +(schoolCheck.isEmpty()?"":" AND "+schoolCheck);
    }
    private static final List<String> SOURCES=List.of(
            source("QUESTION","ai_model_usage activity","activity.user_id","activity.created_at",""),
            source("QUESTION","ai_message_feedback activity","activity.user_id","activity.updated_at",""),
            source("CANTEEN","campus_merchant_ratings activity","activity.user_id","activity.updated_at","activity.school_id=account.school_id"),
            source("CANTEEN","campus_merchant_reviews activity","activity.user_id","activity.created_at","activity.school_id=account.school_id"),
            source("CANTEEN","campus_review_likes activity JOIN campus_merchant_reviews review ON review.id=activity.review_id","activity.user_id","activity.created_at","review.school_id=account.school_id"),
            source("TIMETABLE","student_timetables activity","activity.user_id","activity.imported_at",""),
            source("TIMETABLE","student_course_schedules activity","activity.user_id","activity.imported_at",""),
            source("WALL","campus_wall_entries activity","activity.user_id","activity.created_at","activity.school_id=account.school_id"),
            source("WALL","campus_wall_likes activity JOIN campus_wall_entries entry ON entry.id=activity.entry_id","activity.user_id","activity.created_at","entry.school_id=account.school_id"),
            source("PROJECT","student_projects activity","activity.user_id","activity.updated_at","")
    );
    private static final List<String> FEATURES=List.of("QUESTION","CANTEEN","TIMETABLE","WALL","PROJECT");

    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ,timeout=8)
    public Statistics read(Long school,int days){
        if(school==null || school<=0)throw new ResponseStatusException(HttpStatus.FORBIDDEN,"学校范围无效");
        if(days!=7 && days!=30)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"请选择近7天或近30天");
        Instant now=clock.instant();LocalDate today=now.atZone(ZONE).toLocalDate(),from=today.minusDays(days-1);
        Timestamp start=Timestamp.valueOf(from.atStartOfDay()),until=Timestamp.valueOf(LocalDateTime.ofInstant(now,ZONE));
        long total=jdbc.queryForObject("SELECT COUNT(*) FROM users WHERE school_id=? AND status=1",Long.class,school);
        Map<LocalDate,Long> newByDay=new HashMap<>();
        jdbc.query("SELECT CAST(created_at AS DATE) AS bucket_date,COUNT(*) AS amount FROM users WHERE school_id=? AND status=1 AND created_at>=? AND created_at<? GROUP BY CAST(created_at AS DATE)",
                (org.springframework.jdbc.core.RowCallbackHandler)rs->newByDay.put(rs.getDate("bucket_date").toLocalDate(),rs.getLong("amount")),school,start,until);
        List<Day> daily=new ArrayList<>();
        for(int i=0;i<days;i++){LocalDate day=from.plusDays(i);daily.add(new Day(day,newByDay.getOrDefault(day,0L)));}
        List<Object> args=new ArrayList<>();for(int i=0;i<SOURCES.size();i++)Collections.addAll(args,school,start,until);
        String activity="WITH activity AS ("+String.join(" UNION ALL ",SOURCES)+"), participants AS (SELECT DISTINCT feature,participant_id FROM activity) "
                +"SELECT feature,COUNT(*) AS amount FROM participants GROUP BY feature UNION ALL SELECT 'ALL',COUNT(DISTINCT participant_id) AS amount FROM participants";
        Map<String,Long> counts=new HashMap<>();
        jdbc.query(activity,(org.springframework.jdbc.core.RowCallbackHandler)rs->counts.put(rs.getString("feature"),rs.getLong("amount")),args.toArray());
        long negative=jdbc.queryForObject("SELECT COUNT(*) FROM ai_message_feedback feedback JOIN users account ON account.id=feedback.user_id "
                +"WHERE account.school_id=? AND account.status=1 AND feedback.helpful=0 AND feedback.updated_at>=? AND feedback.updated_at<? "
                +"AND NOT EXISTS(SELECT 1 FROM ai_feedback_resolutions resolution WHERE resolution.feedback_id=feedback.id AND resolution.resolved_at>=feedback.updated_at)",Long.class,school,start,until);
        long contacts=jdbc.queryForObject("SELECT COUNT(*) FROM contact_messages WHERE school_id=? AND status='NEW' AND created_at>=? AND created_at<?",Long.class,school,start,until);
        return new Statistics(days,from,today,now,ZONE.getId(),"SAVED_RECORDS",total,daily.stream().mapToLong(Day::newAccounts).sum(),
                counts.getOrDefault("ALL",0L),FEATURES.stream().map(code->new Feature(code,counts.getOrDefault(code,0L))).toList(),
                List.copyOf(daily),negative,contacts);
    }
}
