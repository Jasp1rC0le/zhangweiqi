package com.campusai.controller;

import com.campusai.timetable.LocalTimetableOcrService;
import com.campusai.timetable.CourseImageImportService;
import com.campusai.timetable.TimetableService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import java.io.IOException;
import java.util.*;
import org.springframework.web.multipart.MultipartFile;
import com.campusai.security.AuthSessionService;

@RestController
@RequestMapping("/api/timetable/courses")
public class TimetableVisionController {
    private final LocalTimetableOcrService service;
    private final CourseImageImportService importer;
    private final AuthSessionService sessions;
    public TimetableVisionController(LocalTimetableOcrService service,CourseImageImportService importer,AuthSessionService sessions){this.service=service;this.importer=importer;this.sessions=sessions;}
    public record AutoCapability(int version,boolean available,String provider,String engine,boolean external,int maxBytes,int maxRows,boolean automaticImport,String bellVersion,java.util.List<com.campusai.timetable.CampusBellSchedule.Slot> bells,boolean batchImport,int maxImages,int maxBatchBytes,int maxBatchSeconds){}
    @GetMapping("/image-capabilities") public ResponseEntity<AutoCapability> capability(@RequestAttribute("currentUserId") long owner){var cap=service.capability(owner);var bells=importer.bells(owner);return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(new AutoCapability(cap.version(),cap.available()&&!bells.isEmpty(),cap.provider(),cap.engine(),cap.external(),cap.maxBytes(),cap.maxRows(),true,com.campusai.timetable.CampusBellSchedule.VERSION,bells,true,LocalTimetableOcrService.MAX_BATCH_IMAGES,LocalTimetableOcrService.MAX_BATCH_BYTES,LocalTimetableOcrService.MAX_BATCH_SECONDS));}
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
    @PostMapping(value="/import-images",consumes=MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<CourseImageImportService.BatchResult> importImages(@RequestAttribute("currentUserId") long owner,@RequestAttribute("currentSessionId") String session,@RequestAttribute("currentUserRole") String role,@RequestParam int revision,@RequestPart("images") List<MultipartFile> files)throws IOException{
        if(files==null||files.isEmpty()||files.size()>LocalTimetableOcrService.MAX_BATCH_IMAGES)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"一次请选择1—20张课表截图");
        var pictures=new ArrayList<byte[]>();long total=0;
        for(var file:files){
            if(file.isEmpty())throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"课表图片为空");
            if(file.getSize()>TimetableService.MAX_IMAGE_BYTES)throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE,"每张课表图片限2MB");
            if(file.getContentType()==null||!Set.of("image/png","image/jpeg").contains(file.getContentType()))throw new ResponseStatusException(HttpStatus.UNSUPPORTED_MEDIA_TYPE,"请选择PNG或JPG课表截图");
            byte[] bytes;try(var input=file.getInputStream()){bytes=input.readNBytes(TimetableService.MAX_IMAGE_BYTES+1);}
            total+=bytes.length;if(total>LocalTimetableOcrService.MAX_BATCH_BYTES)throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE,"课表图片总计限32MB");
            pictures.add(bytes);
        }
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(importer.importImages(owner,revision,pictures,()->sessions.active(session,owner,role)));
    }
}
