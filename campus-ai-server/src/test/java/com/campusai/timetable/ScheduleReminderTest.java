package com.campusai.timetable;

import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

class ScheduleReminderTest {
    private final ScheduleFileWriter writer = new ScheduleFileWriter(new ObjectMapper());
    private ScheduleExportSource.Filter filter(String format, Integer minutes) {
        return new ScheduleExportSource.Filter("MY","STUDENT",LocalDate.of(2026,11,1),LocalDate.of(2026,11,28),"","ALL",format,"",true,minutes);
    }
    private ScheduleExportSource.Row row(String id, boolean cancelled) {
        return new ScheduleExportSource.Row(id,LocalDate.of(2026,11,2),"合成课程","合成教室","","","00:05","01:00","00:05—01:00",List.of("PERSONAL"),cancelled);
    }
    private String file(ScheduleExportSource.Filter filter, List<ScheduleExportSource.Row> rows) throws Exception {
        return new String(writer.write(new ScheduleExportSource.Snapshot(filter,"本人已保存课表",rows,List.of()),Instant.parse("2026-11-01T00:00:00Z")).bytes(),StandardCharsets.UTF_8);
    }
    @Test void legacyExportDoesNotSilentlyInstallAlarms() throws Exception {
        var legacy=new ScheduleExportSource.Filter("MY","STUDENT",LocalDate.of(2026,11,1),LocalDate.of(2026,11,28),"","ALL","ICS","",false);
        assertNull(legacy.reminderMinutes());assertFalse(file(legacy,List.of(row("one",false))).contains("VALARM"));
    }
    @Test void eachSupportedLeadTimeCreatesADisplayAlarmInTheEvent() throws Exception {
        for(int minutes:List.of(5,10,15,30)) {
            var checked=ScheduleExportSource.normalize(filter("ICS",minutes));
            String value=file(checked,List.of(row("one",false)));
            assertTrue(value.contains("BEGIN:VALARM\r\nTRIGGER:-PT"+minutes+"M\r\nACTION:DISPLAY\r\n"));
            assertTrue(value.contains("DESCRIPTION:合成课程即将上课\r\nEND:VALARM\r\nEND:VEVENT"));
            assertTrue(value.contains("DTSTART:20261101T160500Z"));
        }
    }
    @Test void cancelledEventsKeepTheirStatusAndNeverReceiveAnAlarm() throws Exception {
        String value=file(filter("ICS",10),List.of(row("active",false),row("cancelled",true)));
        assertEquals(2,value.split("BEGIN:VEVENT",-1).length-1);
        assertEquals(1,value.split("BEGIN:VALARM",-1).length-1);
        String cancelled=value.substring(value.lastIndexOf("BEGIN:VEVENT"));
        assertTrue(cancelled.contains("STATUS:CANCELLED"));assertFalse(cancelled.contains("VALARM"));
    }
    @Test void invalidMinutesAndNonCalendarRequestsAreRejected() {
        for(int minutes:List.of(-1,1,60,1440))assertThrows(ResponseStatusException.class,()->ScheduleExportSource.normalize(filter("ICS",minutes)));
        assertThrows(ResponseStatusException.class,()->ScheduleExportSource.normalize(filter("CSV",10)));
        assertNull(ScheduleExportSource.normalize(filter("ICS",0)).reminderMinutes());
        assertNull(ScheduleExportSource.normalize(filter("CSV",null)).reminderMinutes());
    }
    @Test void unknownClockTimesCannotBecomeAnApparentlyWorkingReminderFile() {
        var unknown=new ScheduleExportSource.Row("unknown",LocalDate.of(2026,11,2),"合成课程","","","",null,null,"第1节",List.of("PERSONAL"),false);
        assertThrows(ResponseStatusException.class,()->file(filter("ICS",10),List.of(unknown)));
    }
    @Test void eventIdentitySurvivesLeadChangesAndTextCannotInjectCalendarComponents() throws Exception {
        var hostile=new ScheduleExportSource.Row("stable",LocalDate.of(2026,11,2),"合成课程,分号;\nBEGIN:VEVENT","合成教室","","","08:00","09:00","08:00—09:00",List.of("PERSONAL"),false);
        String first=file(filter("ICS",5),List.of(hostile)),second=file(filter("ICS",15),List.of(hostile));
        assertEquals(first.lines().filter(line->line.startsWith("UID:")).findFirst(),second.lines().filter(line->line.startsWith("UID:")).findFirst());
        assertEquals(1,first.lines().filter("BEGIN:VEVENT"::equals).count());
        for(String line:first.split("\r\n"))assertTrue(line.getBytes(StandardCharsets.UTF_8).length<=75);
    }
}
