package com.campusai.controller;

import com.campusai.canteen.CanteenService;
import com.campusai.canteen.CanteenPhotoService;
import com.campusai.service.UserService;
import com.campusai.user.entity.User;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@RestController
@RequestMapping("/api/admin/canteens")
public class AdminCanteenController {
    private final CanteenService canteens;
    private final CanteenPhotoService photos;
    private final UserService users;

    public AdminCanteenController(CanteenService canteens, CanteenPhotoService photos,
            UserService users) {
        this.canteens = canteens;
        this.photos = photos;
        this.users = users;
    }

    @GetMapping
    public List<CanteenService.Canteen> list(@RequestAttribute("currentUserId") Long userId,
            @RequestAttribute("currentUserRole") String role) {
        return canteens.adminCanteens(school(userId, role));
    }

    @GetMapping("/merchants")
    public List<CanteenService.Merchant> merchants(@RequestAttribute("currentUserId") Long userId,
            @RequestAttribute("currentUserRole") String role) {
        return canteens.adminMerchants(school(userId, role));
    }

    @PostMapping
    public CanteenService.Canteen add(@RequestAttribute("currentUserId") Long userId,
            @RequestAttribute("currentUserRole") String role,
            @Valid @RequestBody CanteenService.CanteenInput input) {
        return canteens.saveCanteen(school(userId, role), null, input);
    }

    @PutMapping("/{id}")
    public CanteenService.Canteen update(@RequestAttribute("currentUserId") Long userId,
            @RequestAttribute("currentUserRole") String role, @PathVariable Long id,
            @Valid @RequestBody CanteenService.CanteenInput input) {
        return canteens.saveCanteen(school(userId, role), id, input);
    }

    @PutMapping("/{id}/status")
    public CanteenService.Canteen status(@RequestAttribute("currentUserId") Long userId,
            @RequestAttribute("currentUserRole") String role, @PathVariable Long id,
            @Valid @RequestBody PublishedInput input) {
        return canteens.setCanteenPublished(school(userId, role), id, input.published());
    }

    @PostMapping("/merchants")
    public CanteenService.Merchant addMerchant(@RequestAttribute("currentUserId") Long userId,
            @RequestAttribute("currentUserRole") String role,
            @Valid @RequestBody CanteenService.MerchantInput input) {
        return canteens.saveMerchant(school(userId, role), null, input);
    }

    @PutMapping("/merchants/{id}")
    public CanteenService.Merchant updateMerchant(@RequestAttribute("currentUserId") Long userId,
            @RequestAttribute("currentUserRole") String role, @PathVariable Long id,
            @Valid @RequestBody CanteenService.MerchantInput input) {
        return canteens.saveMerchant(school(userId, role), id, input);
    }

    @PutMapping("/merchants/{id}/status")
    public CanteenService.Merchant merchantStatus(@RequestAttribute("currentUserId") Long userId,
            @RequestAttribute("currentUserRole") String role, @PathVariable Long id,
            @Valid @RequestBody PublishedInput input) {
        return canteens.setMerchantPublished(school(userId, role), id, input.published());
    }

    @PutMapping("/merchants/{id}/operating-status")
    public CanteenService.Merchant operatingStatus(@RequestAttribute("currentUserId") Long userId,
            @RequestAttribute("currentUserRole") String role, @PathVariable Long id,
            @Valid @RequestBody OperatingInput input) {
        return canteens.setOperatingStatus(school(userId, role), id, input.status());
    }

    @PostMapping(value = "/merchants/{id}/photo", consumes = "multipart/form-data")
    public void photo(@RequestAttribute("currentUserId") Long userId,
            @RequestAttribute("currentUserRole") String role, @PathVariable Long id,
            @RequestPart("file") MultipartFile file) {
        photos.save(school(userId, role), id, file);
    }

    @PostMapping(value = "/merchants/publish", consumes = "multipart/form-data")
    public List<CanteenService.Merchant> publish(@RequestAttribute("currentUserId") Long userId,
            @RequestAttribute("currentUserRole") String role,
            @RequestPart("items") List<CanteenPhotoService.PublishInput> items,
            @RequestPart("files") List<MultipartFile> files) {
        return photos.publish(school(userId, role), items, files);
    }

    @PostMapping(value = "/merchants/{id}/photos", consumes = "multipart/form-data")
    public List<CanteenPhotoService.Photo> addPhotos(@RequestAttribute("currentUserId") Long userId,
            @RequestAttribute("currentUserRole") String role, @PathVariable Long id,
            @RequestPart("files") List<MultipartFile> files) {
        return photos.append(school(userId, role), id, files);
    }

    @GetMapping("/merchants/{id}/photos")
    public List<CanteenPhotoService.Photo> photoList(@RequestAttribute("currentUserId") Long userId,
            @RequestAttribute("currentUserRole") String role, @PathVariable Long id) {
        return photos.photoList(school(userId, role), id, false);
    }

    @GetMapping("/reviews")
    public List<CanteenService.AdminReview> reviews(@RequestAttribute("currentUserId") Long userId,
            @RequestAttribute("currentUserRole") String role) {
        return canteens.adminReviews(school(userId, role));
    }

    @PutMapping("/reviews/{id}/status")
    public void reviewStatus(@RequestAttribute("currentUserId") Long userId,
            @RequestAttribute("currentUserRole") String role, @PathVariable Long id,
            @Valid @RequestBody ReviewStatusInput input) {
        canteens.reviewStatus(school(userId, role), id, input.status(), input.expectedComment());
    }

    private Long school(Long userId, String role) {
        if (!"ADMIN".equals(role)) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "需要管理员权限");
        User user = users.getById(userId);
        if (user == null || !"ADMIN".equals(user.getRole()) || user.getStatus() == null
                || user.getStatus() != 1) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "管理员账户无效");
        }
        return user.getSchoolId();
    }

    public record PublishedInput(@NotNull Boolean published) {}
    public record OperatingInput(@NotNull String status) {}
    public record ReviewStatusInput(@NotNull String status,
            @NotNull @jakarta.validation.constraints.Size(max = 500) String expectedComment) {}
}
