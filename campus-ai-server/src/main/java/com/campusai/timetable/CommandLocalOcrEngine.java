package com.campusai.timetable;

import jakarta.annotation.PreDestroy;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;
import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.nio.file.attribute.PosixFilePermissions;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;

@Component
public class CommandLocalOcrEngine implements LocalOcrEngine,AutoCloseable {
    private static final int MAX_OUTPUT=1024*1024;
    private final ObjectMapper json;
    private final String command;
    private final boolean mac;
    private final Set<Process> processes=ConcurrentHashMap.newKeySet();
    private Path runtime,binary;
    public CommandLocalOcrEngine(ObjectMapper json,@Value("${app.timetable.ocr.command:}") String configured){
        this.json=json;
        mac=configured.isBlank()&&System.getProperty("os.name","").toLowerCase(Locale.ROOT).contains("mac");
        command=mac?"/usr/bin/swiftc":configured.isBlank()?List.of("/usr/bin/tesseract","/usr/local/bin/tesseract","/opt/homebrew/bin/tesseract").stream().filter(p->Files.isExecutable(Path.of(p))).findFirst().orElse(""):configured;
    }
    public String engine(){return mac?"apple-vision":"tesseract";}
    public boolean available(){return !command.isBlank()&&Path.of(command).isAbsolute()&&Files.isExecutable(Path.of(command));}
    private synchronized Path runtime() throws IOException {
        if(runtime==null)runtime=Files.createTempDirectory("campthink-local-ocr-",PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rwx------")));
        return runtime;
    }
    private synchronized Path executable(long deadline)throws IOException,InterruptedException{
        if(!mac)return Path.of(command);
        if(binary!=null)return binary;
        Path script=runtime().resolve("recognize.swift"),target=runtime().resolve("recognize");
        try(InputStream source=getClass().getResourceAsStream("/ocr/macos-ocr.swift")){
            if(source==null)throw unavailable();Files.copy(source,script,StandardCopyOption.REPLACE_EXISTING);
        }
        String sdk=run(List.of("/usr/bin/xcrun","--sdk","macosx","--show-sdk-path"),runtime(),deadline).trim();
        if(!Path.of(sdk).isAbsolute()||!Files.isDirectory(Path.of(sdk)))throw unavailable();
        run(List.of(command,"-sdk",sdk,"-O",script.toString(),"-o",target.toString()),runtime(),Math.min(deadline,System.nanoTime()+Duration.ofSeconds(40).toNanos()));
        if(!Files.isExecutable(target))throw unavailable();binary=target;return binary;
    }
    public List<Line> read(BufferedImage image,long deadline){
        return mac?nativeRead(image,List.of(),deadline).lines():tesseractAnchors(image,deadline);
    }
    public List<RegionText> regions(BufferedImage image,List<Region> regions,long deadline){
        if(regions.size()>120)throw unavailable();
        if(mac)return nativeRead(image,regions,deadline).regions();
        var result=new ArrayList<RegionText>();
        for(int i=0;i<regions.size();i++){
            var r=regions.get(i);validateRegion(image,r);
            var crop=image.getSubimage(r.x(),r.y(),r.width(),r.height());int scale=crop.getWidth()<80?3:2;var lines=rescale(tesseract(enhance(crop,r.enhance(),scale),6,deadline),scale,0,0);
            result.add(new RegionText(i,lines,lines.stream().sorted(Comparator.comparingDouble(Line::y).thenComparingDouble(Line::x)).map(Line::text).reduce((a,b)->a+" "+b).orElse("")));
        }
        return List.copyOf(result);
    }
    private record NativeOutput(int version,int width,int height,List<Line> lines,List<RegionText> regions){}
    private NativeOutput nativeRead(BufferedImage image,List<Region> regions,long deadline){
        Path job=null;
        try{
            Path executable=executable(deadline);job=Files.createTempDirectory(runtime(),"job-",PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rwx------")));
            Path input=privateFile(job,"image.png");ImageIO.write(image,"png",input.toFile());
            var args=new ArrayList<>(List.of(executable.toString(),input.toString()));
            if(!regions.isEmpty()){
                for(var r:regions)validateRegion(image,r);
                Path ranges=privateFile(job,"regions.json");Files.writeString(ranges,json.writeValueAsString(regions));args.add(ranges.toString());
            }
            String output=run(args,job,deadline);var parsed=json.readValue(output,NativeOutput.class);
            if(parsed.version()!=1||parsed.width()!=image.getWidth()||parsed.height()!=image.getHeight()||parsed.lines()==null||parsed.regions()==null||parsed.lines().size()>3000||parsed.regions().size()!=regions.size())throw unavailable();
            validLines(parsed.lines());
            for(int i=0;i<parsed.regions().size();i++){var value=parsed.regions().get(i);if(value.index()!=i)throw unavailable();validLines(value.lines());}
            return parsed;
        }catch(ResponseStatusException e){throw e;}catch(Exception e){throw unavailable();}finally{delete(job);}
    }
    private List<Line> tesseract(BufferedImage image,int psm,long deadline){return tesseract(image,psm,deadline,psm==11);}
    private List<Line> tesseract(BufferedImage image,int psm,long deadline,boolean anchors){
        Path job=null;
        try{
            job=Files.createTempDirectory(runtime(),"job-",PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rwx------")));
            Path input=privateFile(job,"image.png");ImageIO.write(image,"png",input.toFile());
            String output=run(List.of(command,input.toString(),"stdout","-l","chi_sim+eng","--psm",String.valueOf(psm),"tsv"),job,deadline);
            Map<String,List<Line>> grouped=new LinkedHashMap<>();
            for(String row:output.split("\\R")){
                var p=row.split("\\t",12);if(p.length!=12||!p[0].equals("5")||p[11].isBlank())continue;
                double confidence=Double.parseDouble(p[10])/100;if(confidence<0)continue;
                var line=new Line(p[11],confidence,Double.parseDouble(p[6]),Double.parseDouble(p[7]),Double.parseDouble(p[8]),Double.parseDouble(p[9]));
                grouped.computeIfAbsent(String.join(":",Arrays.copyOfRange(p,1,5)),k->new ArrayList<>()).add(line);
            }
            var result=new ArrayList<Line>();
            for(var words:grouped.values()){
                String text=words.stream().map(Line::text).reduce((a,b)->a+" "+b).orElse("");double x=words.stream().mapToDouble(Line::x).min().orElse(0),y=words.stream().mapToDouble(Line::y).min().orElse(0);
                double right=words.stream().mapToDouble(v->v.x()+v.width()).max().orElse(x),bottom=words.stream().mapToDouble(v->v.y()+v.height()).max().orElse(y);
                result.add(new Line(text,words.stream().mapToDouble(Line::confidence).average().orElse(0),x,y,right-x,bottom-y));
                // TSV words are retained for weekday/date/period anchors.
                if(anchors&&words.size()>1)result.addAll(words);
            }
            validLines(result);return List.copyOf(result);
        }catch(ResponseStatusException e){throw e;}catch(Exception e){throw unavailable();}finally{delete(job);}
    }
    private List<Line> tesseractAnchors(BufferedImage image,long deadline){
        var result=new ArrayList<>(tesseract(image,11,deadline));
        // The supplied school template has a full-width colored semester/week band.
        int first=-1,last=-1;
        for(int y=0;y<image.getHeight()*0.45;y++){
            int colored=0;for(int x=0;x<image.getWidth();x+=3){int v=image.getRGB(x,y),r=(v>>16)&255,g=(v>>8)&255,b=v&255;if(b>r+25&&g>r+15)colored++;}
            if(colored>image.getWidth()/3.0*0.72){if(first<0)first=y;last=y;}
            else if(first>=0&&y-last>image.getHeight()*0.018)break;
        }
        if(first>=0&&last-first>25){var crop=image.getSubimage(0,first,image.getWidth(),last-first+1);result.addAll(rescale(tesseract(enhance(crop,true,2),6,deadline,true),2,0,first));}
        var dates=result.stream().filter(l->l.text().matches("\\d{1,2}[-/]\\d{1,2}")).toList();
        if(dates.size()>=5){int y=(int)dates.stream().mapToDouble(Line::y).min().orElse(0),height=(int)dates.stream().mapToDouble(Line::height).max().orElse(24);int top=Math.max(0,y-Math.max(55,image.getHeight()/25)),bottom=Math.min(image.getHeight(),y+height+12);
            if(bottom>top){var crop=image.getSubimage(0,top,image.getWidth(),bottom-top);result.addAll(rescale(tesseract(enhance(crop,false,2),6,deadline,true),2,0,top));}}
        return List.copyOf(result);
    }
    private static List<Line> rescale(List<Line> lines,int scale,int x,int y){return lines.stream().map(l->new Line(l.text(),l.confidence(),l.x()/scale+x,l.y()/scale+y,l.width()/scale,l.height()/scale)).toList();}
    private static BufferedImage enhance(BufferedImage source,boolean contrast,int scale){
        var base=new BufferedImage(source.getWidth(),source.getHeight(),BufferedImage.TYPE_INT_RGB);var copy=base.createGraphics();copy.drawImage(source,0,0,null);copy.dispose();
        if(contrast){int light=0,dark=0;for(int y=3;y<base.getHeight()-3;y++)for(int x=3;x<base.getWidth()-3;x++){int v=base.getRGB(x,y),r=(v>>16)&255,g=(v>>8)&255,b=v&255;if(Math.min(r,Math.min(g,b))>210&&Math.max(r,Math.max(g,b))-Math.min(r,Math.min(g,b))<32)light++;if(Math.max(r,Math.max(g,b))<90)dark++;}
            for(int y=0;y<base.getHeight();y++)for(int x=0;x<base.getWidth();x++){int v=base.getRGB(x,y),r=(v>>16)&255,g=(v>>8)&255,b=v&255;boolean inside=x>2&&x<base.getWidth()-3&&y>2&&y<base.getHeight()-3;boolean ink=inside&&(dark>light?Math.max(r,Math.max(g,b))<130:Math.min(r,Math.min(g,b))>205&&Math.max(r,Math.max(g,b))-Math.min(r,Math.min(g,b))<45);base.setRGB(x,y,ink?0:0xffffff);}}
        var out=new BufferedImage(base.getWidth()*scale,base.getHeight()*scale,BufferedImage.TYPE_INT_RGB);var g=out.createGraphics();g.setRenderingHint(java.awt.RenderingHints.KEY_INTERPOLATION,java.awt.RenderingHints.VALUE_INTERPOLATION_BICUBIC);g.drawImage(base,0,0,out.getWidth(),out.getHeight(),null);g.dispose();return out;
    }
    private String run(List<String> args,Path job,long deadline)throws IOException,InterruptedException{
        long millis=Math.min(60000,TimeUnit.NANOSECONDS.toMillis(deadline-System.nanoTime()));if(millis<=0)throw timeout();
        Path stdout=privateFile(job,"stdout-"+UUID.randomUUID()),stderr=privateFile(job,"stderr-"+UUID.randomUUID());
        ProcessBuilder builder=new ProcessBuilder(args).redirectOutput(stdout.toFile()).redirectError(stderr.toFile());
        // A GUI-launched JVM may inherit a CLT SDK newer than xcode-select's Swift.
        // Resolve the SDK with the selected toolchain instead of trusting that override.
        if(mac)builder.environment().remove("SDKROOT");
        Process process=builder.start();processes.add(process);
        try{
            if(!process.waitFor(millis,TimeUnit.MILLISECONDS)){process.descendants().forEach(ProcessHandle::destroyForcibly);process.destroyForcibly();process.waitFor(3,TimeUnit.SECONDS);throw timeout();}
            if(process.exitValue()!=0||Files.size(stdout)>MAX_OUTPUT)throw unavailable();
            return Files.readString(stdout,StandardCharsets.UTF_8);
        }finally{processes.remove(process);if(process.isAlive())process.destroyForcibly();Files.deleteIfExists(stdout);Files.deleteIfExists(stderr);}
    }
    private static Path privateFile(Path dir,String name)throws IOException{return Files.createFile(dir.resolve(name),PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rw-------")));}
    private static void validateRegion(BufferedImage image,Region r){if(r.x()<0||r.y()<0||r.width()<4||r.height()<4||(long)r.x()+r.width()>image.getWidth()||(long)r.y()+r.height()>image.getHeight())throw unavailable();}
    private static void validLines(List<Line> lines){
        if(lines==null||lines.size()>3000)throw unavailable();
        for(var l:lines)if(l==null||l.text()==null||l.text().length()>1000||!Double.isFinite(l.x()+l.y()+l.width()+l.height()+l.confidence())||l.x()<0||l.y()<0||l.width()<=0||l.height()<=0)throw unavailable();
    }
    private static ResponseStatusException unavailable(){return new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"后台本地识别暂未就绪，请使用表格导入或稍后重试");}
    private static ResponseStatusException timeout(){return new ResponseStatusException(HttpStatus.GATEWAY_TIMEOUT,"本地识别超时，未保存课表；请裁剪清晰截图后重试");}
    private static void delete(Path dir){if(dir!=null)try(var paths=Files.walk(dir)){paths.sorted(Comparator.reverseOrder()).forEach(p->{try{Files.deleteIfExists(p);}catch(IOException ignored){}});}catch(IOException ignored){}}
    @PreDestroy public synchronized void close(){processes.forEach(p->{p.descendants().forEach(ProcessHandle::destroyForcibly);p.destroyForcibly();});delete(runtime);}
}
