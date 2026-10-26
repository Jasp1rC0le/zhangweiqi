package com.campusai.material;

import com.campusai.canteen.CanteenService;
import com.campusai.dto.CreateKnowledgeSubmissionRequest;
import com.campusai.dto.CreateContactMessageRequest;
import com.campusai.service.ContactMessageService;
import com.campusai.service.KnowledgeSubmissionService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/material-actions")
public class MaterialCommandController {
    private final MaterialCommandService commands;
    private final KnowledgeSubmissionService submissions;
    private final CanteenService canteens;
    private final ContactMessageService contacts;
    public MaterialCommandController(MaterialCommandService commands,KnowledgeSubmissionService submissions,CanteenService canteens,ContactMessageService contacts){
        this.commands=commands;this.submissions=submissions;this.canteens=canteens;this.contacts=contacts;
    }
    public record KnowledgeRequest(@NotNull String requestId,@NotNull @Valid CreateKnowledgeSubmissionRequest payload){}
    public record MerchantRequest(@NotNull String requestId,@NotNull @Valid CanteenService.MerchantInput payload){}
    public record ContactRequest(@NotNull String requestId,@NotNull @Valid CreateContactMessageRequest payload){}
    public record Capabilities(boolean durableReceipts){}
    @GetMapping("/capabilities") public ResponseEntity<Capabilities> capabilities(@RequestAttribute("currentUserId") Long user){
        commands.actor(user,false);return result(new Capabilities(commands.available()));
    }
    @GetMapping("/requests/{id}") public ResponseEntity<MaterialCommandService.Receipt> read(@RequestAttribute("currentUserId") Long user,@PathVariable String id){
        return result(commands.read(user,id));
    }
    @PostMapping("/knowledge") public ResponseEntity<MaterialCommandService.Receipt> knowledge(@RequestAttribute("currentUserId") Long user,@Valid @RequestBody KnowledgeRequest input){
        return result(commands.execute(user,input.requestId(),"KNOWLEDGE_SUBMISSION",input.payload(),()->submissions.submit(user,input.payload())));
    }
    @PostMapping("/merchant") public ResponseEntity<MaterialCommandService.Receipt> merchant(@RequestAttribute("currentUserId") Long user,@Valid @RequestBody MerchantRequest input){
        commands.actor(user,true);
        return result(commands.execute(user,input.requestId(),"MERCHANT_DRAFT",input.payload(),()->canteens.saveMerchant(commands.actor(user,true).schoolId(),null,input.payload())));
    }
    @PostMapping("/merchant-application") public ResponseEntity<MaterialCommandService.Receipt> contact(@RequestAttribute("currentUserId") Long user,@Valid @RequestBody ContactRequest input){
        input.payload().setRequestId(input.requestId());
        return result(commands.execute(user,input.requestId(),"MERCHANT_APPLICATION",input.payload(),()->contacts.submit(input.payload(),user)));
    }
    private static <T> ResponseEntity<T> result(T body){return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);}
}
