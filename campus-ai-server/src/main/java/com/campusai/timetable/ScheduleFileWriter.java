package com.campusai.timetable;

import org.apache.pdfbox.pdmodel.*;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType0Font;
import org.apache.pdfbox.pdmodel.common.PDStream;
import org.apache.pdfbox.cos.COSName;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.ss.util.CellRangeAddress;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;
import java.io.*;
import java.awt.Color;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.time.format.DateTimeFormatter;
import java.security.MessageDigest;
import java.util.*;

/** Local file encoders. Never network-fetches fonts or executes spreadsheet formulas. */
@Component
public class ScheduleFileWriter {
    private final ObjectMapper json;
    public ScheduleFileWriter(ObjectMapper json){this.json=json;}
    public record File(byte[] bytes,String mime,String extension){}
    public File write(ScheduleExportSource.Snapshot snapshot,Instant generatedAt)throws IOException{
        return switch(snapshot.filter().format()){
            case"JSON"->new File(json.writeValueAsBytes(Map.of("schema","campthink.schedule-export.v1","timezone","Asia/Shanghai","generatedAt",generatedAt,"filter",snapshot.filter(),"scope",snapshot.scopeLabel(),"entries",snapshot.entries(),"warnings",snapshot.warnings())),"application/json","json");
            case"CSV"->new File(csv(snapshot),"text/csv;charset=UTF-8","csv");
            case"XLSX"->new File(xlsx(snapshot),"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","xlsx");
            case"ICS"->new File(ics(snapshot,generatedAt),"text/calendar;charset=UTF-8","ics");
            case"PDF"->new File(pdf(snapshot),"application/pdf","pdf");
            default->throw ScheduleExportSource.error(400,"不支持此文件格式");
        };
    }
    private static String source(ScheduleExportSource.Row r){return r.sources().size()>1?"个人导入与教学合并":r.sources().contains("TEACHING")?"教学安排":"个人导入";}
    private static String status(ScheduleExportSource.Row r){return r.cancelled()?"已取消":"已安排";}
    private static final List<String> HEADERS=List.of("日期","星期","开始钟点","结束钟点","时间或节次","课程","教室","任课教师","班级或教学组","来源","状态");
    private static List<String> cells(ScheduleExportSource.Row r){return Arrays.asList(r.date().toString(),"周"+"一二三四五六日".charAt(r.date().getDayOfWeek().getValue()-1),r.startTime()==null?"":r.startTime(),r.endTime()==null?"":r.endTime(),r.timeLabel(),r.name(),r.room(),r.teacher(),r.className(),source(r),status(r));}
    private static byte[] csv(ScheduleExportSource.Snapshot s){var out=new StringBuilder("\uFEFF");line(out,List.of("课程安排",s.scopeLabel(),s.filter().from().toString(),s.filter().to().toString(),"北京时间"));line(out,HEADERS);for(var r:s.entries())line(out,cells(r));return out.toString().getBytes(StandardCharsets.UTF_8);}
    private static void line(StringBuilder out,List<String> cells){var encoded=new ArrayList<String>();for(String cell:cells){String v=cell==null?"":cell.replaceAll("[\\p{Cntrl}]"," ");if(v.matches("(?Us)^[\\s\\uFEFF]*[=+@-].*"))v="'"+v;encoded.add("\""+v.replace("\"","\"\"")+"\"");}out.append(String.join(",",encoded)).append("\r\n");}
    private static byte[] xlsx(ScheduleExportSource.Snapshot s)throws IOException{
        try(var book=new XSSFWorkbook();var out=new ByteArrayOutputStream()){
            var sheet=book.createSheet("课程安排");sheet.setDisplayGridlines(false);sheet.createFreezePane(2,5);sheet.setFitToPage(true);sheet.getPrintSetup().setLandscape(true);sheet.getPrintSetup().setPaperSize(PrintSetup.A4_PAPERSIZE);sheet.getPrintSetup().setFitWidth((short)1);sheet.getPrintSetup().setFitHeight((short)0);
            var font=book.createFont();font.setFontName("Arial");font.setFontHeightInPoints((short)11);var body=book.createCellStyle();body.setFont(font);body.setVerticalAlignment(VerticalAlignment.CENTER);body.setWrapText(true);
            var header=book.createCellStyle();header.cloneStyleFrom(body);var bold=book.createFont();bold.setFontName("Arial");bold.setFontHeightInPoints((short)11);bold.setBold(true);header.setFont(bold);header.setFillForegroundColor(IndexedColors.GREY_25_PERCENT.getIndex());header.setFillPattern(FillPatternType.SOLID_FOREGROUND);header.setAlignment(HorizontalAlignment.CENTER);
            var title=book.createCellStyle();title.cloneStyleFrom(body);var large=book.createFont();large.setFontName("Arial");large.setFontHeightInPoints((short)16);large.setBold(true);title.setFont(large);title.setWrapText(false);
            var date=book.createCellStyle();date.cloneStyleFrom(body);date.setDataFormat(book.createDataFormat().getFormat("yyyy-mm-dd"));var time=book.createCellStyle();time.cloneStyleFrom(body);time.setDataFormat(book.createDataFormat().getFormat("hh:mm"));
            sheet.createRow(1).createCell(0).setCellValue("课程安排");sheet.getRow(1).getCell(0).setCellStyle(title);sheet.getRow(1).setHeightInPoints(28);
            sheet.createRow(2).createCell(0).setCellValue(s.filter().from()+" 至 "+s.filter().to()+"（北京时间）");sheet.getRow(2).setHeightInPoints(23);
            sheet.createRow(3).createCell(0).setCellValue(s.scopeLabel()+"；共"+s.entries().size()+"项；下载快照，不是实时订阅");sheet.getRow(3).setHeightInPoints(23);
            var heading=sheet.createRow(4);heading.setHeightInPoints(27);for(int i=0;i<HEADERS.size();i++){var c=heading.createCell(i);c.setCellValue(HEADERS.get(i));c.setCellStyle(header);}
            int index=5;for(var r:s.entries()){var row=sheet.createRow(index++);var values=cells(r);int lines=1;for(int i=0;i<values.size();i++){var c=row.createCell(i);c.setCellStyle(body);if(i==0){c.setCellValue(r.date().atStartOfDay());c.setCellStyle(date);}else if((i==2||i==3)&&!values.get(i).isEmpty()){var t=LocalTime.parse(values.get(i));c.setCellValue(t.toSecondOfDay()/86400d);c.setCellStyle(time);}else if(values.get(i).isEmpty())c.setBlank();else c.setCellValue(values.get(i));lines=Math.max(lines,(values.get(i).codePointCount(0,values.get(i).length())+13)/14);}row.setHeightInPoints(Math.max(25,lines*16));}
            int[] widths={15,8,11,11,24,30,28,24,32,25,11};for(int i=0;i<widths.length;i++)sheet.setColumnWidth(i,widths[i]*256);sheet.setAutoFilter(new CellRangeAddress(4,Math.max(4,index-1),0,10));sheet.setRepeatingRows(new CellRangeAddress(4,4,-1,-1));book.setPrintArea(0,0,10,0,index-1);book.write(out);return out.toByteArray();
        }
    }
    private static String escape(String s){return s.replace("\\","\\\\").replace("\r\n","\\n").replace("\n","\\n").replace("\r","\\n").replace(";","\\;").replace(",","\\,");}
    private static void fold(StringBuilder out,String line){int octets=0;for(int i=0;i<line.length();){int cp=line.codePointAt(i);String c=new String(Character.toChars(cp));int n=c.getBytes(StandardCharsets.UTF_8).length;if(octets+n>75){out.append("\r\n ");octets=1;}out.append(c);octets+=n;i+=Character.charCount(cp);}out.append("\r\n");}
    private static byte[] ics(ScheduleExportSource.Snapshot s,Instant at){
        if(s.entries().stream().anyMatch(r->r.startTime()==null||r.endTime()==null))throw ScheduleExportSource.error(400,"范围含未核定钟点，不能生成ICS日历；请先配置作息或换用表格");
        var out=new StringBuilder("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Campthink//Schedule Export//ZH\r\nCALSCALE:GREGORIAN\r\n");var utc=DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss'Z'").withZone(ZoneOffset.UTC);
        for(var r:s.entries()){fold(out,"BEGIN:VEVENT");fold(out,"UID:"+hash(r.id().getBytes(StandardCharsets.UTF_8))+"@campthink.cn");fold(out,"DTSTAMP:"+utc.format(at));fold(out,"DTSTART:"+utc.format(r.date().atTime(LocalTime.parse(r.startTime())).atZone(ZoneId.of("Asia/Shanghai")).toInstant()));fold(out,"DTEND:"+utc.format(r.date().atTime(LocalTime.parse(r.endTime())).atZone(ZoneId.of("Asia/Shanghai")).toInstant()));fold(out,"SUMMARY:"+escape(r.name()));fold(out,"LOCATION:"+escape(r.room()));fold(out,"DESCRIPTION:"+escape("任课教师："+r.teacher()+"；班级或教学组："+r.className()+"；来源："+source(r)+"；这是下载快照，不是实时订阅。"));fold(out,"STATUS:"+(r.cancelled()?"CANCELLED":"CONFIRMED"));fold(out,"END:VEVENT");}
        out.append("END:VCALENDAR\r\n");return out.toString().getBytes(StandardCharsets.UTF_8);
    }
    public static String hash(byte[] bytes){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));}catch(java.security.NoSuchAlgorithmException e){throw new IllegalStateException(e);}}
    private static final class PdfFont{
        final PDType0Font actual;final Map<String,String> unicode=new LinkedHashMap<>();
        PdfFont(PDType0Font actual){this.actual=actual;}
        float getStringWidth(String value)throws IOException{return actual.getStringWidth(value);}
        byte[] encode(String value)throws IOException{byte[] bytes=actual.encode(value);String code=HexFormat.of().formatHex(bytes),old=unicode.putIfAbsent(code,value);if(old!=null&&!old.equals(value))throw new IllegalArgumentException("Ambiguous font glyph");return bytes;}
        void remember(String value)throws IOException{for(int cp:value.codePoints().toArray())encode(new String(Character.toChars(cp)));}
        void attachExactUnicode(PDDocument doc)throws IOException{
            // PDFBox's reverse cmap can choose Kangxi radicals for a shared CJK glyph.
            // Keep the actual source Unicode rather than changing the text or weakening extraction checks.
            var cmap=new StringBuilder("/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /CampthinkExactUnicode def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n");
            var entries=new ArrayList<>(unicode.entrySet());for(int offset=0;offset<entries.size();offset+=100){var batch=entries.subList(offset,Math.min(offset+100,entries.size()));cmap.append(batch.size()).append(" beginbfchar\n");for(var e:batch)cmap.append('<').append(e.getKey()).append("> <").append(HexFormat.of().formatHex(e.getValue().getBytes(StandardCharsets.UTF_16BE))).append(">\n");cmap.append("endbfchar\n");}
            cmap.append("endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend\n");actual.getCOSObject().setItem(COSName.TO_UNICODE,new PDStream(doc,new ByteArrayInputStream(cmap.toString().getBytes(StandardCharsets.US_ASCII)),COSName.FLATE_DECODE));
        }
    }
    private static List<String> wrap(PdfFont font,String text,float width,float size)throws IOException{
        var lines=new ArrayList<String>();var current=new StringBuilder();for(int cp:text.codePoints().toArray()){if(cp=='\n'){lines.add(current.toString());current.setLength(0);continue;}String c=new String(Character.toChars(cp));try{if(font.getStringWidth(current+c)/1000*size>width&&!current.isEmpty()){lines.add(current.toString());current.setLength(0);}font.encode(c);}catch(IllegalArgumentException unsupported){throw ScheduleExportSource.error(400,"当前PDF字体不能表示部分字符，未生成不完整文件；请换用Excel、CSV或JSON");}current.append(c);}lines.add(current.toString());return lines;
    }
    private static void text(PDPageContentStream stream,PdfFont font,float size,float x,float y,String text)throws IOException{font.remember(text);stream.beginText();stream.setFont(font.actual,size);stream.newLineAtOffset(x,y);stream.showText(text);stream.endText();}
    private static byte[] pdf(ScheduleExportSource.Snapshot s)throws IOException{
        try(var fontInput=ScheduleFileWriter.class.getResourceAsStream("/fonts/CampthinkExportSans-Regular.ttf");var doc=new PDDocument();var out=new ByteArrayOutputStream()){
            if(fontInput==null)throw ScheduleExportSource.error(503,"服务器PDF中文字体未安装，请使用其他格式");var font=new PdfFont(PDType0Font.load(doc,fontInput,true));float[] widths={86,106,178,138,116,154};float margin=32,top=548;PDPageContentStream stream=null;float y=0;int pageNo=0;
            try{for(var row:s.entries()){
                List<String> values=List.of(row.date()+"\n周"+"一二三四五六日".charAt(row.date().getDayOfWeek().getValue()-1),row.timeLabel(),row.name()+"\n"+source(row)+(row.cancelled()?" · 已取消":""),row.room(),row.teacher().isEmpty()?"未提供":row.teacher(),row.className());var columns=new ArrayList<List<String>>();int lines=1;for(int i=0;i<values.size();i++){var v=wrap(font,values.get(i),widths[i]-12,10);columns.add(v);lines=Math.max(lines,v.size());}float height=Math.max(44,lines*15+16);
                if(height>390)throw ScheduleExportSource.error(400,"单项课程文字超过PDF页高，请缩小字段或换用Excel；未截断文字");
                if(stream==null||y-height<40){if(stream!=null)stream.close();if(++pageNo>300)throw ScheduleExportSource.error(400,"PDF超过300页，请缩小范围；未截断文件");var page=new PDPage(new PDRectangle(PDRectangle.A4.getHeight(),PDRectangle.A4.getWidth()));doc.addPage(page);stream=new PDPageContentStream(doc,page);stream.setNonStrokingColor(new Color(41,50,60));text(stream,font,21,margin,top,"课程安排");text(stream,font,10,margin,top-23,s.filter().from()+" 至 "+s.filter().to()+"（北京时间），共 "+s.entries().size()+" 项");var scopeLines=wrap(font,s.scopeLabel(),770,10);float next=top-42;for(String line:scopeLines){text(stream,font,10,margin,next,line);next-=15;}
                    y=next-10;stream.setNonStrokingColor(new Color(242,245,250));stream.addRect(margin,y-26,778,26);stream.fill();stream.setNonStrokingColor(new Color(41,50,60));float x=margin;String[] headers={"日期","时间或节次","课程与来源","教室","任课教师","班级或教学组"};for(int i=0;i<headers.length;i++){text(stream,font,10,x+6,y-17,headers[i]);x+=widths[i];}y-=26;text(stream,font,8,margin,18,"Campthink · 下载快照，不是实时教务订阅 · 第 "+pageNo+" 页");}
                float x=margin;for(int i=0;i<columns.size();i++){float baseline=y-16;for(String line:columns.get(i)){text(stream,font,10,x+6,baseline,line);baseline-=15;}x+=widths[i];}y-=height;stream.setStrokingColor(new Color(226,231,236));stream.setLineWidth(.5f);stream.moveTo(margin,y);stream.lineTo(margin+778,y);stream.stroke();
            }}finally{if(stream!=null)stream.close();}
            doc.save(out);font.attachExactUnicode(doc);out.reset();doc.save(out);return out.toByteArray();
        }
    }
}
