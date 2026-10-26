package com.campusai.timetable;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import java.awt.image.BufferedImage;
import java.text.Normalizer;
import java.time.*;
import java.util.*;
import java.util.regex.*;
import static com.campusai.timetable.LocalOcrEngine.*;

/** Geometry and transcription for the supplied seven-day, numbered-period school screenshot. */
public class SchoolTimetableImageParser {
    public record Header(double left,double columnWidth,double weekdayY,String semester,Integer week,List<Integer> years,List<String> dates){}
    public record Grid(double top,double periodHeight,int maxPeriod){}
    public record Card(int weekday,Region region,Integer startPeriod,Integer endPeriod){}
    public record Row(String name,Integer weekday,String startTime,String endTime,Integer startPeriod,Integer endPeriod,List<Integer> weeks,String room,String teacher,String reviewNote){}
    public record Parsed(String semester,String firstMonday,Integer week,String weekMonday,List<Row> rows,List<String> warnings){}
    private static final Pattern SEMESTER=Pattern.compile("(20\\d{2})[-–—~](20\\d{2})学年第?([12])学期");
    private static final Pattern WEEK=Pattern.compile("第(\\d{1,2})周");
    private static final Pattern ROOM=Pattern.compile("教学楼|教学馆|工业中心|综合楼|实验楼|体育馆|实验室|机房|教室|操场|[（(]?[A-Z]\\d?座|[A-Z]\\d?[-—]\\d{2,4}");
    public Header header(BufferedImage image,List<Line> lines){
        List<Line> weekdays=lines.stream().filter(l->weekday(l.text())>0&&l.width()<image.getWidth()*.2).toList();
        Line[] selected=null;
        for(Line anchor:weekdays){
            Line[] group=new Line[7];
            for(Line l:weekdays)if(Math.abs(l.centerY()-anchor.centerY())<Math.max(15,image.getHeight()*.012)){
                int n=weekday(l.text())-1;if(group[n]==null||l.confidence()>group[n].confidence())group[n]=l;
            }
            if(Arrays.stream(group).allMatch(Objects::nonNull)){selected=group;break;}
        }
        if(selected==null)throw unsupported();
        var gaps=new ArrayList<Double>();for(int i=1;i<7;i++){double g=selected[i].centerX()-selected[i-1].centerX();if(g<=0)throw unsupported();gaps.add(g);}
        double width=median(gaps),left=selected[0].centerX()-width/2,y=Arrays.stream(selected).mapToDouble(Line::centerY).average().orElseThrow();
        if(width<24||left<-width*.15||left+7*width>image.getWidth()+width*.3||gaps.stream().anyMatch(g->Math.abs(g-width)>width*.22))throw unsupported();
        left=Math.max(0,left);
        String semester=null;List<Integer> years=List.of();Set<Integer> weeks=new TreeSet<>();
        for(Line line:lines)if(line.centerY()<y){
            String text=compact(line.text());Matcher m=SEMESTER.matcher(text);
            if(m.find()&&Integer.parseInt(m.group(2))==Integer.parseInt(m.group(1))+1){semester=m.group(1)+"-"+m.group(2)+"学年第"+m.group(3)+"学期";years=List.of(Integer.parseInt(m.group(1)),Integer.parseInt(m.group(2)));}
            m=WEEK.matcher(text);if(m.find()){int n=Integer.parseInt(m.group(1));if(n>=1&&n<=30)weeks.add(n);}
        }
        List<String> dates=new ArrayList<>(Collections.nCopies(7,""));
        for(Line l:lines){String text=compact(l.text());if(l.centerY()<=y+10||l.centerY()>y+image.getHeight()*.06||!text.matches("\\d{1,2}[-/]\\d{1,2}"))continue;
            int i=(int)Math.floor((l.centerX()-left)/width);if(i>=0&&i<7&&Math.abs(l.centerX()-(left+(i+.5)*width))<width*.45)dates.set(i,text.replace('/','-'));
        }
        return new Header(left,width,y,semester,weeks.size()==1?weeks.iterator().next():null,years,List.copyOf(dates));
    }
    public Region periodStrip(BufferedImage image,Header h){
        int width=(int)Math.floor(h.left()),top=(int)Math.max(0,h.weekdayY()+35),bottom=(int)Math.min(image.getHeight(),image.getHeight()*.91);
        if(width<8||bottom-top<50)throw unsupported();return new Region(0,top,width,bottom-top,false);
    }
    public Grid grid(BufferedImage image,Header h,List<Line> full,List<Line> strip,Region region){
        var numbers=new ArrayList<double[]>();
        for(Line l:full)addPeriod(numbers,l,h);
        for(Line l:strip)addPeriod(numbers,new Line(l.text(),l.confidence(),l.x(),l.y()+region.y(),l.width(),l.height()),h);
        var slopes=new ArrayList<Double>();
        for(var a:numbers)for(var b:numbers)if(b[0]>a[0]&&b[1]>a[1]){double d=(b[1]-a[1])/(b[0]-a[0]);if(d>image.getHeight()/100.0&&d<image.getHeight()/4.0)slopes.add(d);}
        if(slopes.isEmpty())throw unsupported();double step=median(slopes);
        double top=median(numbers.stream().map(n->n[1]-(n[0]-.5)*step).toList());
        var good=numbers.stream().filter(n->Math.abs(n[1]-(top+(n[0]-.5)*step))<step*.22).toList();
        if(good.stream().map(n->n[0]).distinct().count()<3||top<h.weekdayY()+20||top>image.getHeight()*.7)throw unsupported();
        return new Grid(top,step,(int)good.stream().mapToDouble(n->n[0]).max().orElseThrow());
    }
    private void addPeriod(List<double[]> values,Line line,Header h){String s=compact(line.text());if(s.matches("(?:[1-9]|1[0-6])")&&line.x()+line.width()<=h.left()+4&&line.centerY()>h.weekdayY()+35)values.add(new double[]{Integer.parseInt(s),line.centerY()});}
    public List<Card> cards(BufferedImage image,Header h,Grid grid){
        var result=new ArrayList<Card>();int first=Math.max(0,(int)Math.floor(grid.top())),bottom=Math.min(image.getHeight(),(int)Math.ceil(grid.top()+grid.maxPeriod()*grid.periodHeight()));
        for(int day=0;day<7;day++){
            int x=Math.max(0,(int)Math.floor(h.left()+day*h.columnWidth())+2),right=Math.min(image.getWidth(),(int)Math.floor(h.left()+(day+1)*h.columnWidth())-2);
            int start=-1,last=-1;double[] previous=null;
            for(int y=first;y<=bottom;y++){
                double[] color=y<bottom?colorRow(image,x,right,y):new double[]{0,0,0,0};boolean strong=color[0]>=.18;
                boolean different=strong&&previous!=null&&distance(previous,color)>55;
                boolean blank=color[0]<.015;
                if(start>=0&&(different||blank||y-last>4)){
                    addCard(result,image,day+1,x,right,start,last+1,grid);start=-1;previous=null;
                }
                if(strong){if(start<0)start=y;last=y;previous=color;}
            }
        }
        result.sort(Comparator.comparingInt(Card::weekday).thenComparingInt(c->c.region().y()));
        if(result.isEmpty()||result.size()>120)throw unsupported();return List.copyOf(result);
    }
    private void addCard(List<Card> result,BufferedImage image,int day,int left,int right,int top,int bottom,Grid g){
        if(bottom-top<g.periodHeight()*.55||right-left<16)return;
        int start=(int)Math.round((top-g.top())/g.periodHeight())+1,end=(int)Math.round((bottom-g.top())/g.periodHeight());
        boolean aligned=start>=1&&end>=start&&end<=16&&Math.abs(top-(g.top()+(start-1)*g.periodHeight()))<g.periodHeight()*.23&&Math.abs(bottom-(g.top()+end*g.periodHeight()))<g.periodHeight()*.23;
        int y=Math.max(0,top-1),last=Math.min(image.getHeight(),bottom+1);
        result.add(new Card(day,new Region(left,y,right-left,last-y,true),aligned?start:null,aligned?end:null));
    }
    private double[] colorRow(BufferedImage image,int left,int right,int y){
        double count=0,r=0,g=0,b=0;
        for(int x=left;x<right;x++){int rgb=image.getRGB(x,y),red=rgb>>16&255,green=rgb>>8&255,blue=rgb&255;int max=Math.max(red,Math.max(green,blue)),min=Math.min(red,Math.min(green,blue));
            if(max>=120&&(max-min)/(double)Math.max(1,max)>=.12){count++;r+=red;g+=green;b+=blue;}}
        return count==0?new double[]{0,0,0,0}:new double[]{count/Math.max(1,right-left),r/count,g/count,b/count};
    }
    private double distance(double[] a,double[] b){return Math.sqrt(Math.pow(a[1]-b[1],2)+Math.pow(a[2]-b[2],2)+Math.pow(a[3]-b[3],2));}
    public Parsed finish(Header h,List<Card> cards,List<RegionText> results){
        if(results.size()!=cards.size())throw unsupported();var rows=new ArrayList<Row>();var warnings=new ArrayList<String>();
        for(int i=0;i<cards.size();i++){
            Card c=cards.get(i);RegionText recognized=results.get(i);if(recognized.index()!=i)throw unsupported();
            String source=recognized.joined();if(source==null||source.isBlank())source=recognized.lines().stream().sorted(Comparator.comparingDouble(Line::y).thenComparingDouble(Line::x)).map(Line::text).reduce((a,b)->a+" "+b).orElse("");
            String text=normalize(source),teacher="";Matcher tm=Pattern.compile("(?:任课教师|授课教师|教师)[:：]([^,，;；]{1,30})").matcher(text);
            if(tm.find()){teacher=tm.group(1).trim();text=text.substring(0,tm.start()).trim();}
            Matcher room=ROOM.matcher(text);int split=room.find()?room.start():-1;
            // The location prefix can include 综合/公共 before 教学楼.
            if(split>=2&&(text.substring(split-2,split).equals("公共")||text.substring(split-2,split).equals("综合")))split-=2;
            String name=split<0?text:text.substring(0,split),place=split<0?"":text.substring(split);
            String note="";if(name.isBlank())note="课程名称需补充";
            else if(name.matches(".*[川W|]+(?:[（(].*)?$"))note="名称中的符号需对照原图核对";
            if(c.startPeriod()==null||c.endPeriod()==null)note=note.isEmpty()?"节次边界需核对":note+"；节次边界需核对";
            if(!note.isEmpty())warnings.add("第"+(i+1)+"行："+note);
            rows.add(new Row(limit(name,100),c.weekday(),null,null,c.startPeriod(),c.endPeriod(),h.week()==null?List.of():List.of(h.week()),limit(place,100),limit(teacher,100),note));
        }
        String weekMonday=resolveMonday(h),first=null;
        if(weekMonday!=null&&h.week()!=null){var value=LocalDate.parse(weekMonday).minusWeeks(h.week()-1L);if(value.getYear()>=2000&&value.getYear()<=2100)first=value.toString();}
        if(h.week()==null)warnings.add("截图周次未读清，请补充；未猜整学期周次");
        else warnings.add("只识别截图明确的第"+h.week()+"周，未补其他周");
        if(first==null)warnings.add("开学第一周日期需按校历确认");
        if(rows.stream().allMatch(r->r.teacher().isEmpty()))warnings.add("截图没有明确教师姓名，未填充教师或绑定账号");
        return new Parsed(h.semester(),first,h.week(),weekMonday,List.copyOf(rows),List.copyOf(warnings.stream().limit(20).toList()));
    }
    private String resolveMonday(Header h){
        if(h.dates().stream().anyMatch(String::isEmpty))return null;var matches=new ArrayList<LocalDate>();
        for(int year:h.years())try{
            String[] p=h.dates().get(0).split("-");LocalDate monday=LocalDate.of(year,Integer.parseInt(p[0]),Integer.parseInt(p[1]));if(monday.getDayOfWeek()!=DayOfWeek.MONDAY)continue;
            boolean valid=true;for(int i=0;i<7;i++){var date=monday.plusDays(i);String[] d=h.dates().get(i).split("-");if(date.getMonthValue()!=Integer.parseInt(d[0])||date.getDayOfMonth()!=Integer.parseInt(d[1]))valid=false;}
            if(valid)matches.add(monday);
        }catch(RuntimeException ignored){}
        return matches.size()==1?matches.get(0).toString():null;
    }
    private static int weekday(String text){return switch(compact(text)){case"周一"->1;case"周二"->2;case"周三"->3;case"周四"->4;case"周五"->5;case"周六"->6;case"周日","周天"->7;default->0;};}
    private static String compact(String value){return Normalizer.normalize(value==null?"":value,Normalizer.Form.NFKC).replaceAll("\\s+","");}
    private static String normalize(String value){return Normalizer.normalize(value==null?"":value,Normalizer.Form.NFKC).replaceAll("[\\p{Cntrl}]","").replaceAll("\\s+(?=\\p{IsHan})|(?<=\\p{IsHan})\\s+","").replaceAll("\\s*([-()])\\s*","$1").trim();}
    private static String limit(String value,int max){return value.length()>max?value.substring(0,max):value;}
    private static double median(List<Double> values){if(values.isEmpty())throw unsupported();var list=values.stream().sorted().toList();return list.size()%2==1?list.get(list.size()/2):(list.get(list.size()/2-1)+list.get(list.size()/2))/2;}
    private static ResponseStatusException unsupported(){return new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,"未能完整读取此课表版式，请上传包含周一至周日、日期和节次的清晰截图");}
}
