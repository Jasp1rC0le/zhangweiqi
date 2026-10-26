package com.campusai.timetable;

import org.junit.jupiter.api.Test;
import java.awt.*;
import java.awt.image.BufferedImage;
import java.util.*;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;
import static com.campusai.timetable.LocalOcrEngine.*;

class SchoolTimetableImageParserTest {
    static BufferedImage image(){var image=new BufferedImage(800,1000,BufferedImage.TYPE_INT_RGB);var g=image.createGraphics();g.setColor(Color.WHITE);g.fillRect(0,0,800,1000);g.setColor(new Color(90,170,230));g.fillRect(52,200,96,120);g.setColor(new Color(240,160,140));g.fillRect(252,440,96,120);g.dispose();return image;}
    static List<Line> lines(){
        var result=new ArrayList<Line>();result.add(line("2026-2027学年第1学期",260,20,300,25));result.add(line("第9周",350,60,80,20));
        String[] weekdays={"周一","周二","周三","周四","周五","周六","周日"};
        for(int i=0;i<7;i++){result.add(line(weekdays[i],80+100*i,100,40,20));result.add(line("11-0"+(i+2),75+100*i,140,50,20));}
        for(int n=1;n<=12;n++)result.add(line(String.valueOf(n),10,200+(n-1)*60+20,20,20));
        return result;
    }
    static Line line(String text,double x,double y,double width,double height){return new Line(text,.95,x,y,width,height);}
    @Test void sevenColumnsAndObservedPeriodAnchorsDetermineExactBlocks(){
        var parser=new SchoolTimetableImageParser();var image=image();var h=parser.header(image,lines());var strip=parser.periodStrip(image,h);var grid=parser.grid(image,h,lines(),List.of(),strip);var cards=parser.cards(image,h,grid);
        assertEquals(200,grid.top(),.1);assertEquals(60,grid.periodHeight(),.1);assertEquals(12,grid.maxPeriod());assertEquals(2,cards.size());
        assertEquals(1,cards.get(0).weekday());assertEquals(1,cards.get(0).startPeriod());assertEquals(2,cards.get(0).endPeriod());assertEquals(3,cards.get(1).weekday());assertEquals(5,cards.get(1).startPeriod());assertEquals(6,cards.get(1).endPeriod());
    }
    @Test void datesAndExplicitWeekResolveTheAnchorWithoutTodayOrWholeTermGuesses(){
        var parser=new SchoolTimetableImageParser();var image=image();var h=parser.header(image,lines());var cards=parser.cards(image,h,parser.grid(image,h,lines(),List.of(),parser.periodStrip(image,h)));
        var result=parser.finish(h,cards,List.of(new RegionText(0,List.of(),"合成课程甲 公共教学楼(D座)D-101"),new RegionText(1,List.of(),"合成课程乙 体育馆(G座)二楼")));
        assertEquals("2026-09-07",result.firstMonday());assertEquals("2026-11-02",result.weekMonday());assertEquals(9,result.week());
        assertEquals("合成课程甲",result.rows().get(0).name());assertEquals("公共教学楼(D座)D-101",result.rows().get(0).room());assertEquals(List.of(9),result.rows().get(0).weeks());assertEquals("",result.rows().get(0).teacher());
    }
    @Test void missingWeekOrInconsistentDatesRemainUnknown(){
        var parser=new SchoolTimetableImageParser();var image=image();var supplied=new ArrayList<>(lines());supplied.removeIf(l->l.text().equals("第9周"));
        var h=parser.header(image,supplied);var cards=parser.cards(image,h,parser.grid(image,h,supplied,List.of(),parser.periodStrip(image,h)));
        var data=List.of(new RegionText(0,List.of(),"合成课甲"),new RegionText(1,List.of(),"合成课乙"));var result=parser.finish(h,cards,data);assertNull(result.firstMonday());assertTrue(result.rows().get(0).weeks().isEmpty());
        supplied=new ArrayList<>(lines());supplied.removeIf(l->l.text().equals("11-08"));supplied.add(line("11-09",675,140,50,20));h=parser.header(image,supplied);assertNull(parser.finish(h,cards,data).firstMonday());
    }
    @Test void aNonTimetableOrMissingDayHeaderIsRejectedInsteadOfSentToAProvider(){
        var parser=new SchoolTimetableImageParser();assertThrows(RuntimeException.class,()->parser.header(image(),List.of(line("普通图片",100,100,100,30))));
        var source=new ArrayList<>(lines());source.removeIf(l->l.text().equals("周五"));assertThrows(RuntimeException.class,()->parser.header(image(),source));
    }
    @Test void suspiciousSymbolsAreMarkedForReviewRatherThanSilentlyCorrected(){
        var parser=new SchoolTimetableImageParser();var h=parser.header(image(),lines());var cards=parser.cards(image(),h,parser.grid(image(),h,lines(),List.of(),parser.periodStrip(image(),h)));
        var result=parser.finish(h,cards,List.of(new RegionText(0,List.of(),"合成课程川 体育馆"),new RegionText(1,List.of(),"另一课程")));
        assertEquals("合成课程川",result.rows().get(0).name());assertFalse(result.rows().get(0).reviewNote().isBlank());
    }
}
