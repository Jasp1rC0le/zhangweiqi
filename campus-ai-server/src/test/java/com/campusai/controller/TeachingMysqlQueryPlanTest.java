package com.campusai.controller;

import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import java.sql.*;
import java.nio.file.*;
import java.time.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

/** Read-only diagnostic, not a new capacity sample or application authorization test. */
@Timeout(30)
@EnabledIfEnvironmentVariable(named="RUN_TEACHING_QUERY_PLAN_MYSQL",matches="true")
class TeachingMysqlQueryPlanTest {
    @Test void readOnlyPreparedConflictPlanAndExplicitJoinOrder()throws Exception{
        String schema=System.getenv("HTTP_TEST_MYSQL_SCHEMA");assertTrue(schema!=null&&schema.matches("campthink_http_20261017_[a-f0-9]{12}"));int port=Integer.parseInt(System.getenv("HTTP_TEST_MYSQL_PORT"));assertTrue(port>=1024&&port<=65535);
        var result=new LinkedHashMap<String,Object>();result.put("schema",schema);result.put("readOnly",true);result.put("diagnosticNotCapacity",true);
        try(var connection=DriverManager.getConnection("jdbc:mysql://127.0.0.1:"+port+"/"+schema+"?serverTimezone=Asia/Shanghai&characterEncoding=utf8&connectTimeout=2000&socketTimeout=6000",System.getenv("HTTP_TEST_MYSQL_USER"),System.getenv("HTTP_TEST_MYSQL_PASSWORD"))){
            connection.setReadOnly(true);connection.setAutoCommit(false);
            String body=" COUNT(DISTINCT l.id) FROM teaching_attendance_scopes shared_member JOIN teaching_attendance_scopes other_member ON other_member.student_id=shared_member.student_id AND other_member.school_id=shared_member.school_id AND other_member.withdrawn=FALSE JOIN teaching_lessons l ON l.id=shared_member.lesson_id AND l.school_id=shared_member.school_id JOIN teaching_lessons other ON other.id=other_member.lesson_id AND other.school_id=other_member.school_id WHERE l.school_id=? AND l.starts_at>=? AND l.starts_at<? AND l.cancelled=FALSE AND other.id<>l.id AND other.cancelled=FALSE AND other.starts_at<l.ends_at AND other.ends_at>l.starts_at AND shared_member.school_id=? AND shared_member.withdrawn=FALSE AND EXISTS(SELECT 1 FROM teaching_grants g WHERE g.school_id=shared_member.school_id AND g.user_id=? AND g.view_role='SECRETARY' AND g.scope_key=shared_member.college)";
            List<Object> args=List.of(1L,Timestamp.from(LocalDate.of(2026,10,12).atStartOfDay(ZoneId.of("Asia/Shanghai")).toInstant()),Timestamp.from(LocalDate.of(2026,10,19).atStartOfDay(ZoneId.of("Asia/Shanghai")).toInstant()),1L,2L);
            for(String mode:List.of("normal","studentJoinOrder")){
                String sql="SELECT /*+ MAX_EXECUTION_TIME(3000) "+("studentJoinOrder".equals(mode)?"JOIN_ORDER(shared_member,other_member,l,other)":"")+" */"+body;
                var values=new LinkedHashMap<String,Object>();
                try(var plan=connection.prepareStatement("EXPLAIN FORMAT=TREE "+sql)){for(int i=0;i<args.size();i++)plan.setObject(i+1,args.get(i));plan.setQueryTimeout(4);try(var rows=plan.executeQuery()){rows.next();values.put("plan",rows.getString(1));}}
                long began=System.nanoTime();try(var query=connection.prepareStatement(sql)){for(int i=0;i<args.size();i++)query.setObject(i+1,args.get(i));query.setQueryTimeout(4);try(var rows=query.executeQuery()){rows.next();values.put("conflicts",rows.getInt(1));}}catch(SQLException failure){values.put("sqlState",Objects.toString(failure.getSQLState(),""));values.put("errorCode",failure.getErrorCode());}
                values.put("millis",(System.nanoTime()-began)/1000000);result.put(mode,values);
            }
            connection.rollback();
        }
        String encoded=new tools.jackson.databind.ObjectMapper().writeValueAsString(result);Files.writeString(Path.of("../.local/runtime/teaching-mysql-jdbc-plan-2026-10-17.json"),encoded);System.out.println("JDBC_QUERY_PLAN "+encoded);
    }
}
