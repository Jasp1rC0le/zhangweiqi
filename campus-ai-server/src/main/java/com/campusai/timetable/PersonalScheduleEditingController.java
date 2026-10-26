package com.campusai.timetable;
import com.campusai.material.MaterialCommandService;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.*;

@RestController @RequestMapping("/api/timetable/personal-editing")
public class PersonalScheduleEditingController {
    private final CourseScheduleService schedules;private final PersonalScheduleEditingService editing;private final MaterialCommandService commands;private final tools.jackson.databind.ObjectMapper json;
    public PersonalScheduleEditingController(CourseScheduleService schedules,PersonalScheduleEditingService editing,MaterialCommandService commands,tools.jackson.databind.ObjectMapper json){this.schedules=schedules;this.editing=editing;this.commands=commands;this.json=json;}
    public record Request(String requestId,PersonalScheduleEditingService.Edit payload){}
    @GetMapping public ResponseEntity<?> state(@RequestAttribute("currentUserId") Long user){commands.actor(user,false);return ok(java.util.Map.of("historyEnabled",schedules.historyAvailable()&&commands.available(),"terms",schedules.terms(user)));}
    @GetMapping("/history") public ResponseEntity<?> history(@RequestAttribute("currentUserId") Long user,@RequestParam(defaultValue="0") int page){commands.actor(user,false);return ok(editing.history(user,page));}
    @GetMapping("/history/{revision}") public ResponseEntity<?> revision(@RequestAttribute("currentUserId") Long user,@PathVariable int revision){commands.actor(user,false);return ok(editing.revision(user,revision));}
    @GetMapping("/requests/{id}") public ResponseEntity<?> receipt(@RequestAttribute("currentUserId") Long user,@PathVariable String id){
        var receipt=commands.read(user,id);if(!"PERSONAL_SCHEDULE".equals(receipt.kind()))throw new org.springframework.web.server.ResponseStatusException(HttpStatus.NOT_FOUND,"没有这个个人课表操作回执");return ok(receipt);
    }
    @PostMapping(consumes="application/json") public ResponseEntity<?> edit(@RequestAttribute("currentUserId") Long user,jakarta.servlet.http.HttpServletRequest http) throws java.io.IOException {
        commands.actor(user,false);byte[] bytes=http.getInputStream().readNBytes(200001);
        if(bytes.length>200000)throw new org.springframework.web.server.ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE,"个人课表变更限200KB");
        Request request;
        try{request=json.readerFor(Request.class).without(tools.jackson.databind.DeserializationFeature.ACCEPT_FLOAT_AS_INT).with(tools.jackson.databind.DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES).readValue(bytes);}
        catch(Exception e){throw new org.springframework.web.server.ResponseStatusException(HttpStatus.BAD_REQUEST,"课表变更格式无效，请重新核对");}
        if(request==null)throw new org.springframework.web.server.ResponseStatusException(HttpStatus.BAD_REQUEST,"变更请求为空");
        return ok(commands.execute(user,request.requestId(),"PERSONAL_SCHEDULE",request.payload(),()->editing.edit(user,request.payload())));
    }
    private static ResponseEntity<?> ok(Object body){return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);}
}
