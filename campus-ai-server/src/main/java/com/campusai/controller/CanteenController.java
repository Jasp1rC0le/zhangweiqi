package com.campusai.controller;

import com.campusai.canteen.CanteenService;
import com.campusai.canteen.CanteenPhotoService;
import com.campusai.canteen.CanteenWriteThrottle;
import com.campusai.service.UserService;
import com.campusai.user.entity.User;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.concurrent.TimeUnit;

@RestController
@RequestMapping("/api/canteens")
public class CanteenController {
    private final CanteenService canteens;
    private final CanteenPhotoService photos;
    private final UserService users;
    private final CanteenWriteThrottle throttle;

    public CanteenController(CanteenService canteens, CanteenPhotoService photos, UserService users, CanteenWriteThrottle throttle) {
        this.canteens = canteens;
        this.photos = photos;
        this.users = users;
        this.throttle = throttle;
    }

    @GetMapping
    public List<CanteenService.Canteen> list(@RequestAttribute("currentUserId") Long userId) {
        return canteens.publishedCanteens(currentUser(userId).getSchoolId());
    }

    @GetMapping("/merchants")
    public List<CanteenService.PublicMerchant> merchants(
            @RequestAttribute("currentUserId") Long userId) {
        return canteens.publishedMerchants(currentUser(userId).getSchoolId(), userId);
    }

    @PutMapping("/merchants/{id}/rating")
    public List<CanteenService.PublicMerchant> rate(@RequestAttribute("currentUserId") Long userId,
            @PathVariable Long id, @Valid @RequestBody CanteenService.RatingInput input) {
        User user = currentUser(userId);
        if (!"STUDENT".equals(user.getRole())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "仅学生账户可以评分");
        }
        throttle.check(userId);
        canteens.rate(user.getSchoolId(), userId, id, input.score(), input.comment());
        return canteens.publishedMerchants(user.getSchoolId(), userId);
    }

    @GetMapping("/merchants/{id}/reviews")
    public List<CanteenService.PublicReview> reviews(@RequestAttribute("currentUserId") Long userId,
            @PathVariable Long id) {
        return canteens.reviews(currentUser(userId).getSchoolId(), userId, id);
    }

    @PutMapping("/merchants/{id}/reviews/{reviewId}/like")
    public List<CanteenService.PublicReview> like(@RequestAttribute("currentUserId") Long userId,
            @PathVariable Long id, @PathVariable Long reviewId,
            @Valid @RequestBody CanteenService.LikeInput input) {
        User user = currentUser(userId);
        if (!"STUDENT".equals(user.getRole())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "仅学生账户可以参与评价");
        }
        throttle.check(userId);
        canteens.like(user.getSchoolId(), userId, id, reviewId, input.liked());
        return canteens.reviews(user.getSchoolId(), userId, id);
    }

    @GetMapping(value = "/merchants/{id}/photo", produces = MediaType.IMAGE_JPEG_VALUE)
    public ResponseEntity<byte[]> photo(@PathVariable Long id) {
        byte[] jpeg = photos.publicPhoto(id);
        if (jpeg == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "商家照片不存在");
        return ResponseEntity.ok().contentType(MediaType.IMAGE_JPEG)
                .cacheControl(CacheControl.maxAge(1, TimeUnit.MINUTES)).body(jpeg);
    }

    private User currentUser(Long userId) {
        User user = users.getById(userId);
        if (user == null || user.getStatus() == null || user.getStatus() != 1) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "请先登录");
        }
        return user;
    }
}
