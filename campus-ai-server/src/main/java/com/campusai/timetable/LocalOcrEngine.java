package com.campusai.timetable;

import java.awt.image.BufferedImage;
import java.util.List;

/** Local executable OCR only; no provider client, model quota, URL or user history. */
public interface LocalOcrEngine {
    record Line(String text,double confidence,double x,double y,double width,double height) {
        public double centerX(){return x+width/2;}
        public double centerY(){return y+height/2;}
    }
    record Region(int x,int y,int width,int height,boolean enhance) {}
    record RegionText(int index,List<Line> lines,String joined) {}
    boolean available();
    String engine();
    List<Line> read(BufferedImage image,long deadlineNanos);
    List<RegionText> regions(BufferedImage image,List<Region> regions,long deadlineNanos);
}
