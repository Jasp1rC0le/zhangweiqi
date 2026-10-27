package com.campusai.controller;

import com.campusai.timetable.LocalTimetableOcrService;
import com.campusai.timetable.CourseImageImportService;
import com.campusai.timetable.TimetableService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import java.io.IOException;

@RestController
@RequestMapping("/api/timetable/courses")
public class TimetableVisionController {
    private final LocalTimetableOcrService service;
    private final CourseImageImportService importer;
    public TimetableVisionController(LocalTimetableOcrService service,CourseImageImportService importer){this.service=service;this.importer=importer;}
    public record AutoCapability(int version,boolean available,String provider,String engine,boolean external,int maxBytes,int maxRows,boolean automaticImport,String bellVersion,java.util.List<com.campusai.timetable.CampusBellSchedule.Slot> bells){}
    @GetMapping("/image-capabilities") public ResponseEntity<AutoCapability> capability(@RequestAttribute("currentUserId") long owner){var cap=service.capability(owner);var bells=importer.bells(owner);return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(new AutoCapability(cap.version(),cap.available()&&!bells.isEmpty(),cap.provider(),cap.engine(),cap.external(),cap.maxBytes(),cap.maxRows(),true,com.campusai.timetable.CampusBellSchedule.VERSION,bells));}
    @PostMapping(value="/recognize-image",consumes={"image/png","image/jpeg"})
    public ResponseEntity<LocalTimetableOcrService.Result> recognize(@RequestAttribute("currentUserId") long owner,HttpServletRequest request)throws IOException{
        if(request.getContentLengthLong()>TimetableService.MAX_IMAGE_BYTES)throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE,"课表图片限2MB，请裁剪后再试");
        byte[] bytes=request.getInputStream().readNBytes(TimetableService.MAX_IMAGE_BYTES+1);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.recognize(owner,bytes));
    }
    @PostMapping(value="/import-image",consumes={"image/png","image/jpeg"})
    public ResponseEntity<CourseImageImportService.Result> importImage(@RequestAttribute("currentUserId") long owner,@RequestParam int revision,HttpServletRequest request)throws IOException{
        if(request.getContentLengthLong()>TimetableService.MAX_IMAGE_BYTES)throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE,"课表图片限2MB");
        byte[] bytes=request.getInputStream().readNBytes(TimetableService.MAX_IMAGE_BYTES+1);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(importer.importImage(owner,revision,bytes));
    }
}
