package com.campusai.timetable;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import tools.jackson.databind.ObjectMapper;
import javax.imageio.ImageIO;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.TimeUnit;
import static org.junit.jupiter.api.Assertions.*;

/** Explicit local opt-in; no user's screenshot or recognized course text is a repository fixture. */
@EnabledIfEnvironmentVariable(named="TIMETABLE_OCR_SAMPLE",matches=".+")
class LocalOcrProvidedImageTest {
    @Test void suppliedImageRunsTheActualOfflineEngineAndGeometryPipeline()throws Exception{
        try(var engine=new CommandLocalOcrEngine(new ObjectMapper(),"")){
            assertTrue(engine.available());var image=ImageIO.read(Path.of(System.getenv("TIMETABLE_OCR_SAMPLE")).toFile());var parser=new SchoolTimetableImageParser();long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(75);
            var full=engine.read(image,deadline);var h=parser.header(image,full);var strip=parser.periodStrip(image,h);var labels=engine.regions(image,List.of(strip),deadline);var grid=parser.grid(image,h,full,labels.get(0).lines(),strip);var cards=parser.cards(image,h,grid);var result=parser.finish(h,cards,engine.regions(image,cards.stream().map(SchoolTimetableImageParser.Card::region).toList(),deadline));
            assertFalse(result.rows().isEmpty());assertTrue(result.rows().stream().allMatch(r->r.weekday()>=1&&r.weekday()<=7));
            String output=System.getenv("TIMETABLE_OCR_SAMPLE_RESULT");if(output!=null)Files.writeString(Path.of(output),new ObjectMapper().writeValueAsString(Map.of("engine",engine.engine(),"grid",grid,"result",result)));
            System.out.println("LOCAL_OCR_SAMPLE rows="+result.rows().size()+"; no model/provider/AI quota invoked");
        }
    }
}
