package com.campusai.timetable;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.api.condition.EnabledOnOs;
import org.junit.jupiter.api.condition.OS;
import tools.jackson.databind.ObjectMapper;
import java.nio.file.*;
import java.awt.image.BufferedImage;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static com.campusai.timetable.LocalOcrEngine.*;
@EnabledOnOs({OS.LINUX,OS.MAC})
class AccurateOcrBridgeTest {
 @TempDir Path directory;
 @Test void structuredUnicodeFieldsCrossTheBoundedLocalProcessProtocol()throws Exception{
  Path python=directory.resolve("python");String output="{\"version\":1,\"width\":10,\"height\":10,\"lines\":[],\"regions\":[{\"index\":0,\"lines\":[{\"text\":\"合成课程\",\"confidence\":0.9,\"x\":1,\"y\":1,\"width\":8,\"height\":4}],\"joined\":\"合成课程 地点\",\"title\":\"合成课程Ⅲ\",\"room\":\"合成场馆\",\"reliable\":true}]}";
  String literal=new ObjectMapper().writeValueAsString(output);
  Files.writeString(python,"#!/usr/bin/env python3\nimport json,sys\npayload=json.loads("+literal+")\nprint('LOCAL_OCR_READY_V1',flush=True)\nfor line in sys.stdin:\n request=json.loads(line)\n print(json.dumps({'id':request['id'],'result':payload,'error':None},ensure_ascii=False),flush=True)\n");assertTrue(python.toFile().setExecutable(true));
  try(var engine=new CommandLocalOcrEngine(new ObjectMapper(),"/bin/echo",python.toString())){
   assertTrue(engine.available());assertEquals("tesseract+ppocrv5-local",engine.engine());var result=engine.regions(new BufferedImage(10,10,BufferedImage.TYPE_INT_RGB),List.of(new Region(0,0,10,10,true)),System.nanoTime()+java.util.concurrent.TimeUnit.SECONDS.toNanos(10));assertEquals("合成课程Ⅲ",result.get(0).title());assertEquals("合成场馆",result.get(0).room());assertEquals(Boolean.TRUE,result.get(0).reliable());
  }
 }
}
