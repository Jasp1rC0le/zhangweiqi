package com.campusai.controller;

import com.campusai.operations.WebsiteStatisticsService;
import com.campusai.service.UserService;
import org.springframework.dao.DataAccessException;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/admin/website-statistics")
public class AdminWebsiteStatisticsController {
    private final WebsiteStatisticsService statistics;
    private final UserService users;
    public AdminWebsiteStatisticsController(WebsiteStatisticsService statistics,UserService users){this.statistics=statistics;this.users=users;}
    @GetMapping
    public ResponseEntity<WebsiteStatisticsService.Statistics> read(@RequestAttribute("currentUserId")Long userId,
            @RequestAttribute("currentUserRole")String role,@RequestParam(defaultValue="7")int days){
        if(!"ADMIN".equals(role))throw new ResponseStatusException(HttpStatus.FORBIDDEN,"需要管理员权限");
        var admin=users.getById(userId);
        if(admin==null || !"ADMIN".equals(admin.getRole()) || !Integer.valueOf(1).equals(admin.getStatus()) || admin.getSchoolId()==null)
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,"管理员账户无效");
        try{return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(statistics.read(admin.getSchoolId(),days));}
        catch(DataAccessException failure){throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"网站统计暂未能读取，请重试");}
    }
}
