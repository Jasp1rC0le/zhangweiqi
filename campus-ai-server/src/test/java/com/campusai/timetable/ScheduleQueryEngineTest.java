package com.campusai.timetable;

import java.time.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.web.server.ResponseStatusException;
import static org.junit.jupiter.api.Assertions.*;

@Timeout(5)
class ScheduleQueryEngineTest {
    final LocalDate today=LocalDate.of(2026,10,15);
    final Instant now=Instant.parse("2026-10-15T01:00:00Z"); // Shanghai 09:00
    UnifiedTimetableService.Entry entry(int day,String name,String start,String end) {
        return new UnifiedTimetableService.Entry(UUID.randomUUID().toString(),null,today.plusDays(day),4,name,"合成教室","合成教师","",start,end,null,null,
                start==null?"第9—10节（钟点待配置）":start+"—"+end,List.of("PERSONAL"),List.of(),false,false,false,null,null);
    }
    List<UnifiedTimetableService.Entry> rows() { return List.of(entry(0,"上午课程","08:30","09:15"),entry(0,"下一门","10:20","11:55"),entry(0,"下午课程","14:00","15:35"),entry(1,"明天课程","08:30","11:55")); }
    ScheduleQueryEngine.Query q(String period,String selection,String detail,LocalDateTime anchor) {
        return ScheduleQueryEngine.parse(today,today.plusDays(6),period,selection,detail,anchor);
    }
    @Test void periodsUseActualClockAndDoNotReturnAfternoonForMorning() {
        var morning=ScheduleQueryEngine.answer(q("AM","ALL","SUMMARY",null),rows(),now);
        assertEquals(3,morning.count());assertTrue(morning.answer().contains("上午课程"));assertFalse(morning.answer().contains("下午课程"));
        assertEquals(1,ScheduleQueryEngine.answer(q("PM","ALL","LOCATION",null),rows(),now).count());
        assertEquals(0,ScheduleQueryEngine.answer(q("EVENING","ALL","SUMMARY",null),rows(),now).count());
    }
    @Test void nextSkipsOngoingLessonButCurrentIncludesItAndRemainingIncludesBoth() {
        var next=ScheduleQueryEngine.answer(q("ALL","NEXT","LOCATION",null),rows(),now);
        assertEquals(1,next.count());assertEquals(today.atTime(10,20),next.focus());assertTrue(next.answer().contains("下一门"));assertFalse(next.answer().contains("上午课程"));
        assertTrue(ScheduleQueryEngine.answer(q("ALL","CURRENT","SUMMARY",null),rows(),now).answer().contains("上午课程"));
        assertEquals(4,ScheduleQueryEngine.answer(q("ALL","REMAINING","SUMMARY",null),rows(),now).count());
    }
    @Test void followupPinsSelectedLessonEvenAfterTimePassesAndAdvanceUsesExplicitAnchor() {
        var next=ScheduleQueryEngine.answer(q("ALL","NEXT","LOCATION",null),rows(),now);
        var detail=ScheduleQueryEngine.answer(q("ALL","AT","TEACHER",next.focus()),rows(),now.plusSeconds(5*3600));
        assertEquals(next.focus(),detail.focus());assertTrue(detail.answer().contains("合成教师"));assertTrue(detail.answer().contains("下一门"));
        var later=ScheduleQueryEngine.answer(q("ALL","NEXT","SUMMARY",next.focus()),rows(),now);
        assertEquals(today.atTime(14,0),later.focus());
    }
    @Test void concurrentCoursesAreNeverArbitrarilyReducedToOne() {
        var entries=new ArrayList<>(rows());entries.add(entry(0,"同时间另一课程","10:20","11:05"));
        var next=ScheduleQueryEngine.answer(q("ALL","NEXT","SUMMARY",null),entries,now);
        assertEquals(2,next.count());assertTrue(next.answer().contains("另一课程"));
    }
    @Test void weeklyAnswerGroupsActualDatesCountsArrangementsAndNamesEmptyDaysHonestly() {
        var week=ScheduleQueryEngine.answer(q("ALL","ALL","SUMMARY",null),rows(),now);
        assertEquals(4,week.count());assertTrue(week.answer().contains("2026-10-16 周五"));
        var count=ScheduleQueryEngine.answer(q("ALL","ALL","COUNT",null),rows(),now);
        assertTrue(count.answer().contains("4项课程安排"));assertTrue(count.answer().contains("不是课节总数"));
        var free=ScheduleQueryEngine.answer(q("ALL","ALL","FREE",null),rows(),now);
        assertTrue(free.answer().contains("2026-10-17"));assertTrue(free.answer().contains("不是实时空闲"));
    }
    @Test void unknownClockCannotMasqueradeAsNextAndPartFilteringExplainsOmission() {
        var entries=new ArrayList<>(rows());entries.add(entry(0,"未知钟点",null,null));
        var next=ScheduleQueryEngine.answer(q("ALL","NEXT","SUMMARY",null),entries,now);
        assertEquals(0,next.count());assertNull(next.focus());assertTrue(next.answer().contains("暂不能准确定位"));
        var morning=ScheduleQueryEngine.answer(q("AM","ALL","SUMMARY",null),entries,now);
        assertEquals(3,morning.count());assertEquals(1,morning.unknownTimes());assertTrue(morning.answer().contains("未混入时段"));
        assertEquals(5,ScheduleQueryEngine.answer(q("ALL","ALL","SUMMARY",null),entries,now).count());
        assertEquals(1,ScheduleQueryEngine.answer(q("ALL","AT","TEACHER",today.atTime(10,20)),entries,now).count(),"unrelated unknown times do not invalidate an already selected known lesson");
    }
    @Test void clockBoundaryAtEndDoesNotCountAsCurrentAndNextCanStartAtNow() {
        assertEquals(0,ScheduleQueryEngine.answer(q("ALL","CURRENT","SUMMARY",null),rows(),Instant.parse("2026-10-15T01:15:00Z")).count());
        assertEquals(today.atTime(10,20),ScheduleQueryEngine.answer(q("ALL","NEXT","SUMMARY",null),rows(),Instant.parse("2026-10-15T02:20:00Z")).focus());
    }
    @Test void invalidAndOversizedQueriesRejectInsteadOfClippingOrGuessing() {
        for(Runnable task:List.<Runnable>of(()->q("BAD","ALL","SUMMARY",null),()->q("ALL","AT","SUMMARY",null),()->q("ALL","AT","SUMMARY",today.minusDays(1).atStartOfDay()),
                ()->ScheduleQueryEngine.parse(today,today.plusDays(14),"ALL","ALL","SUMMARY",null),()->ScheduleQueryEngine.parse(today,today.minusDays(1),"ALL","ALL","SUMMARY",null)))
            assertEquals(400,assertThrows(ResponseStatusException.class,task::run).getStatusCode().value());
        var many=new ArrayList<UnifiedTimetableService.Entry>();for(int i=0;i<201;i++) many.add(entry(0,"课程"+i,"08:30","09:15"));
        assertThrows(ResponseStatusException.class,()->ScheduleQueryEngine.answer(q("ALL","ALL","SUMMARY",null),many,now));
    }
    @Test void dynamicCourseMatchingUsesActualNamesKeepsAmbiguityAndNeverHardcodesStudentCourses() {
        var saved=List.of(entry(0,"计算机网络基础","08:30","10:05"),entry(0,"计算机网络实验","14:00","15:35"),entry(0,"计算机原理与组成","10:20","11:55"));
        var shortName=ScheduleQueryEngine.answer(ScheduleQueryEngine.parse(today,today,"ALL","ALL","LOCATION",null,"计网"),saved,now);
        assertEquals(2,shortName.count());assertTrue(shortName.answer().contains("简称候选"));assertTrue(shortName.answer().contains("多个名称"));assertFalse(shortName.answer().contains("原理与组成"));
        var exact=ScheduleQueryEngine.answer(ScheduleQueryEngine.parse(today,today,"ALL","ALL","TEACHER",null,"网络基础"),saved,now);
        assertEquals(1,exact.count());assertTrue(exact.answer().contains("合成教师"));
        assertEquals(0,ScheduleQueryEngine.answer(ScheduleQueryEngine.parse(today,today,"ALL","ALL","SUMMARY",null,"不存在的课程"),saved,now).count());
    }
    @Test void unknownClockOnlyBlocksOrderingWhenItsDateCanCompeteWithTheSelectedLesson(){
        var values=List.of(entry(0,"已知正在上课","08:30","09:15"),entry(0,"已知下一节","10:20","11:55"),entry(2,"两天后未知钟点",null,null));
        assertEquals(1,ScheduleQueryEngine.answer(q("ALL","CURRENT","SUMMARY",null),values,now).count());
        assertTrue(ScheduleQueryEngine.answer(q("ALL","NEXT","SUMMARY",null),values,now).answer().contains("已知下一节"));
        assertTrue(ScheduleQueryEngine.answer(q("ALL","FIRST","SUMMARY",null),values,now).answer().contains("已知正在上课"));
        var last=List.of(entry(0,"今天未知",null,null),entry(2,"最后一天已知","08:30","09:15"));
        assertEquals(1,ScheduleQueryEngine.answer(q("ALL","LAST","SUMMARY",null),last,now).count());
        var sameDay=List.of(entry(0,"已知下一节","10:20","11:55"),entry(0,"同一天未知",null,null));
        assertEquals(0,ScheduleQueryEngine.answer(q("ALL","NEXT","SUMMARY",null),sameDay,now).count());
    }
    @Test void previousMeansLatestEndedUnlessExplicitlyContinuingFromAChosenStart() {
        var values=new ArrayList<>(rows());
        values.add(entry(-1,"昨天最后一节","16:40","17:25"));
        var previous=ScheduleQueryEngine.parse(today.minusDays(13),today,"ALL","PREVIOUS","SUMMARY",null);
        var answer=ScheduleQueryEngine.answer(previous,values,now);
        assertEquals(today.minusDays(1).atTime(16,40),answer.focus(),"ongoing morning course is not an already ended course");
        var atEnd=ScheduleQueryEngine.answer(previous,values,Instant.parse("2026-10-15T01:15:00Z"));
        assertEquals(today.atTime(8,30),atEnd.focus());
        var anchored=ScheduleQueryEngine.parse(today.minusDays(13),today,"ALL","PREVIOUS","SUMMARY",today.atTime(14,0));
        assertEquals(today.atTime(10,20),ScheduleQueryEngine.answer(anchored,values,now).focus());
    }
    @Test void previousKeepsSimultaneousAlternativesAndUncertainClocksAreNotGuessed() {
        var values=new ArrayList<>(rows());values.add(entry(0,"同时结束的另一课程","08:30","09:15"));
        var previous=q("ALL","PREVIOUS","SUMMARY",null);
        var after=Instant.parse("2026-10-15T01:15:00Z");
        assertEquals(2,ScheduleQueryEngine.answer(previous,values,after).count());
        values.add(entry(0,"当天未知钟点",null,null));
        var unclear=ScheduleQueryEngine.answer(previous,values,after);
        assertEquals(0,unclear.count());assertNull(unclear.focus());assertTrue(unclear.answer().contains("暂不能准确定位"));
    }
    @Test void previousWithoutAnchorMeansMostRecentlyEndedNotMostRecentlyStarted() {
        var saved=List.of(entry(0,"先开始但最后结束","08:30","11:55"),entry(0,"后开始但先结束","10:20","11:05"));
        var past=ScheduleQueryEngine.answer(q("ALL","PREVIOUS","SUMMARY",null),saved,Instant.parse("2026-10-15T04:00:00Z"));
        assertEquals(1,past.count());assertEquals("先开始但最后结束",past.display().entries().get(0).name());
        var anchored=ScheduleQueryEngine.answer(q("ALL","PREVIOUS","SUMMARY",today.atTime(14,0)),saved,Instant.parse("2026-10-15T04:00:00Z"));
        assertEquals("后开始但先结束",anchored.display().entries().get(0).name(),"explicit previous-of-a-selected-start retains start ordering");
    }
    @Test void equalLatestEndTimesKeepAllAlternativesAndDoNotInventOneStartAnchor() {
        var saved=List.of(entry(0,"早开始同结束","08:30","11:55"),entry(0,"晚开始同结束","10:20","11:55"));
        var past=ScheduleQueryEngine.answer(q("ALL","PREVIOUS","SUMMARY",null),saved,Instant.parse("2026-10-15T04:00:00Z"));
        assertEquals(2,past.count());assertNull(past.focus(),"different starts cannot be reduced to a single followup anchor");
    }
    @Test void excludedSourceRecordsAreExplainedWithoutReturningThemAsActiveCourses() {
        var original=entry(0,"已标记的合成旧课","08:30","09:15");
        var excluded=new UnifiedTimetableService.Entry(original.id(),original.lessonId(),original.date(),original.weekday(),original.name(),original.room(),original.teacher(),original.className(),
                original.startTime(),original.endTime(),original.startPeriod(),original.endPeriod(),original.timeLabel(),original.sources(),original.originIds(),true,false,false,null,null);
        var result=ScheduleQueryEngine.answer(q("ALL","ALL","SUMMARY",null),List.of(excluded),now);
        assertEquals(0,result.count());assertEquals("EMPTY",result.display().state());
        assertTrue(result.answer().contains("取消或待核对"));
        assertTrue(result.display().notices().stream().anyMatch(n->n.contains("1项")&&n.contains("取消或待核对")));
        assertFalse(result.answer().contains(original.name()));
        var outside=ScheduleQueryEngine.answer(ScheduleQueryEngine.parse(today.plusDays(1),today.plusDays(1),"ALL","ALL","SUMMARY",null),List.of(excluded),now);
        assertTrue(outside.display().notices().isEmpty(),"excluded notices respect the requested dates");
    }
    @Test void countdownUsesTheServerInstantAndExplainsItsSnapshotRatherThanStartingATimer() {
        var next=ScheduleQueryEngine.answer(q("ALL","NEXT","WAIT_START",null),rows(),now);
        assertEquals(1,next.count());assertTrue(next.display().summary().contains("1小时20分钟"));
        assertTrue(next.answer().contains("1小时20分钟"));
        assertTrue(next.answer().contains("北京时间")&&next.answer().contains("09:00")&&next.answer().contains("不会自动刷新"));
        var current=ScheduleQueryEngine.answer(q("ALL","CURRENT","WAIT_END",null),rows(),now);
        assertTrue(current.display().summary().contains("15分钟"));
        var before=ScheduleQueryEngine.answer(q("ALL","AT","WAIT_END",today.atTime(14,0)),rows(),now);
        assertTrue(before.display().summary().contains("尚未到计划开始"));assertTrue(before.display().summary().contains("6小时35分钟"));
    }
    @Test void countdownHandlesExactBoundaryElapsedAndSubMinuteWithoutInventingAttendance() {
        var source=List.of(entry(0,"边界合成课","08:30","09:15"));
        var query=q("ALL","AT","WAIT_START",today.atTime(8,30));
        assertTrue(ScheduleQueryEngine.answer(query,source,Instant.parse("2026-10-15T00:30:00Z")).display().summary().contains("已到计划开始"));
        assertTrue(ScheduleQueryEngine.answer(query,source,Instant.parse("2026-10-15T00:29:40Z")).display().summary().contains("不到1分钟"));
        var elapsed=ScheduleQueryEngine.answer(query,source,now);
        assertTrue(elapsed.display().summary().contains("已过计划开始"));assertTrue(elapsed.display().summary().contains("30分钟"));
        assertFalse(elapsed.answer().contains("你迟到"));
    }
    @Test void plannedSpanIncludesBreaksAndDifferentTargetsAreNotCollapsedIntoOneDuration() {
        var source=List.of(entry(0,"长课","08:30","11:55"));
        var result=ScheduleQueryEngine.answer(q("ALL","ALL","DURATION",null),source,now);
        assertTrue(result.display().summary().contains("3小时25分钟"));
        assertTrue(result.answer().contains("课间")&&result.answer().contains("课时"));
        var multiple=ScheduleQueryEngine.answer(q("ALL","ALL","WAIT_START",null),rows(),now);
        assertTrue(multiple.display().summary().contains("不同开始时间"));
        assertTrue(multiple.display().summary().contains("指定"));
        var unknown=ScheduleQueryEngine.answer(q("ALL","NEXT","WAIT_START",null),List.of(entry(0,"未知钟点",null,null)),now);
        assertEquals("UNRESOLVED",unknown.display().state());assertEquals(0,unknown.count());
    }
    @Test void structuredDisplayUsesTheSameSelectedRowsWithoutRosterOrAttendanceFields() {
        var answer=ScheduleQueryEngine.answer(q("PM","ALL","LOCATION",null),rows(),now);
        var json=new tools.jackson.databind.ObjectMapper().valueToTree(answer);
        var display=json.get("display");assertNotNull(display);
        assertEquals(1,display.get("version").asInt());assertEquals("READY",display.get("state").asText());
        assertEquals(answer.count(),display.get("entries").size());
        var row=display.get("entries").get(0);
        assertEquals("下午课程",row.get("name").asText());assertEquals("14:00",row.get("startTime").asText());
        assertEquals("合成教室",row.get("room").asText());assertEquals("合成教师",row.get("teacher").asText());
        assertFalse(row.has("counts"));assertFalse(row.has("attendance"));assertFalse(row.has("className"));assertFalse(row.has("studentId"));
        var count=ScheduleQueryEngine.answer(q("ALL","ALL","PERIODS",null),rows(),now);
        assertTrue(new tools.jackson.databind.ObjectMapper().valueToTree(count).get("display").get("summary").asText().contains("节"));
    }
    @Test void structuredEmptyAndUnresolvedStatesRemainDistinctAndFreeDatesKeepTheRange() {
        var mapper=new tools.jackson.databind.ObjectMapper();
        var empty=mapper.valueToTree(ScheduleQueryEngine.answer(q("ALL","ALL","SUMMARY",null),List.of(),now)).get("display");
        assertNotNull(empty);assertEquals("EMPTY",empty.get("state").asText());assertTrue(empty.get("entries").isEmpty());
        var uncertain=mapper.valueToTree(ScheduleQueryEngine.answer(q("ALL","NEXT","SUMMARY",null),List.of(entry(0,"钟点缺失",null,null)),now)).get("display");
        assertEquals("UNRESOLVED",uncertain.get("state").asText());assertTrue(uncertain.get("summary").asText().contains("钟点"));
        var free=mapper.valueToTree(ScheduleQueryEngine.answer(q("ALL","ALL","FREE",null),rows(),now)).get("display");
        assertEquals(5,free.get("freeDates").size());
    }
    @Test void unmatchedNameWithExistingDataIsAClarificationNotAnEmptyCalendar() {
        var saved=rows();
        var query=ScheduleQueryEngine.parse(today,today.plusDays(6),"ALL","ALL","SUMMARY",null,"未识别的名称");
        var result=ScheduleQueryEngine.answer(query,saved,now);
        assertEquals(0,result.count());assertNull(result.focus());
        assertFalse(result.answer().contains("这个范围内没有匹配的已保存安排"));
        var encoded=new tools.jackson.databind.ObjectMapper().valueToTree(result);
        var display=encoded.get("display");
        assertEquals("UNRESOLVED",display.get("state").asString());
        assertEquals(4,encoded.get("refinement").get("availableCount").asInt());
        assertEquals(4,encoded.get("refinement").get("courseChoices").size());
        assertTrue(encoded.get("refinement").get("choicesComplete").asBoolean());
        var absent=ScheduleQueryEngine.answer(query,List.of(),now);
        assertEquals("EMPTY",new tools.jackson.databind.ObjectMapper().valueToTree(absent).get("display").get("state").asString());
    }
    @Test void actualNamesKeepMeaningfulSymbolsAndExactMatchesBeatBroadSubstrings() {
        var saved=List.of(entry(0,"C++","08:30","09:15"),entry(0,"C#","10:20","11:05"),entry(0,"C++程序设计","14:00","15:35"));
        var result=ScheduleQueryEngine.answer(ScheduleQueryEngine.parse(today,today,"ALL","ALL","SUMMARY",null,"C++"),saved,now);
        assertEquals(1,result.count());assertFalse(result.answer().contains("C#"));assertFalse(result.answer().contains("C++程序设计"));
        assertThrows(ResponseStatusException.class,()->ScheduleQueryEngine.answer(
                ScheduleQueryEngine.parse(today,today,"ALL","ALL","SUMMARY",null,"---"),saved,now));
        String longName="课程".repeat(45);
        assertEquals(1,ScheduleQueryEngine.answer(ScheduleQueryEngine.parse(today,today,"ALL","ALL","SUMMARY",null,longName),
                List.of(entry(0,longName,"08:30","09:15")),now).count());
    }
    @Test void tooManyChoicesAreNotPartiallyPresentedAsACompleteCatalog() {
        var saved=new ArrayList<UnifiedTimetableService.Entry>();
        for(int i=0;i<201;i++)saved.add(entry(0,"合成不同课程"+i,"08:30","09:15"));
        var result=ScheduleQueryEngine.answer(ScheduleQueryEngine.parse(today,today,"ALL","ALL","FREE",null,"不匹配名称"),saved,now);
        var encoded=new tools.jackson.databind.ObjectMapper().valueToTree(result);
        var display=encoded.get("display");
        assertEquals("UNRESOLVED",display.get("state").asString());
        assertEquals(201,encoded.get("refinement").get("availableCount").asInt());
        assertFalse(encoded.get("refinement").get("choicesComplete").asBoolean());
        assertTrue(encoded.get("refinement").get("courseChoices").isEmpty());
        assertTrue(display.get("freeDates").isEmpty(),"unrecognized names do not imply all days free");
    }
}
