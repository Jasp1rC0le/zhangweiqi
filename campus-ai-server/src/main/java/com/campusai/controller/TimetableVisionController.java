package com.campusai.controller;

import com.campusai.timetable.TimetableVisionService;
import com.campusai.timetable.TimetableVisionModel;
import com.campusai.timetable.TimetableService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import java.io.IOException;

@RestController
@RequestMapping("/api/timetable/courses")
public class TimetableVisionController {
    private final TimetableVisionService service;
    public TimetableVisionController(TimetableVisionService service){this.service=service;}
    @GetMapping("/image-capabilities") public ResponseEntity<TimetableVisionModel.Capability> capability(@RequestAttribute("currentUserId") long owner){return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.capability(owner));}
    @PostMapping(value="/recognize-image",consumes={"image/png","image/jpeg"})
    public ResponseEntity<TimetableVisionService.Result> recognize(@RequestAttribute("currentUserId") long owner,@RequestParam(defaultValue="false") boolean consent,HttpServletRequest request)throws IOException{
        if(!consent)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"请先确认图片识别的数据发送范围");
        if(request.getContentLengthLong()>TimetableService.MAX_IMAGE_BYTES)throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE,"课表图片限2MB，请裁剪后再试");
        byte[] bytes=request.getInputStream().readNBytes(TimetableService.MAX_IMAGE_BYTES+1);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.recognize(owner,bytes,true));
    }
}
