package com.campusai.timetable;

import java.util.List;

/** User supplied 2026-10-14; not inferred from period numbers or advertised as an official feed. */
public final class CampusBellSchedule {
    private CampusBellSchedule() {}
    public record Slot(int period, String start, String end) {}
    public record Span(int startPeriod, int endPeriod, String start, String end) {}
    public static final String VERSION = "user-supplied-2026-10-14";
    public static final List<Slot> SLOTS = List.of(
            new Slot(1,"08:30","09:15"), new Slot(2,"09:20","10:05"),
            new Slot(3,"10:20","11:05"), new Slot(4,"11:10","11:55"),
            new Slot(5,"14:00","14:45"), new Slot(6,"14:50","15:35"),
            new Slot(7,"15:50","16:35"), new Slot(8,"16:40","17:25"));
    public static Span span(Integer first,Integer last) {
        if(first==null || last==null || first<1 || last>8 || last<first) return null;
        return new Span(first,last,SLOTS.get(first-1).start,SLOTS.get(last-1).end);
    }
    public static Span exact(String start,String end) {
        Integer a=null,b=null;
        for(Slot slot:SLOTS) { if(slot.start.equals(start)) a=slot.period; if(slot.end.equals(end)) b=slot.period; }
        return span(a,b);
    }
}
