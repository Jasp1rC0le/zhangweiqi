package com.campusai.controller;

import com.campusai.canteen.CanteenService;
import com.campusai.canteen.CanteenPhotoService;
import com.campusai.canteen.CanteenWriteThrottle;
import com.campusai.service.UserService;
import com.campusai.user.entity.User;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class CanteenControllerTest {
    final CanteenService service=mock(CanteenService.class);
    final UserService users=mock(UserService.class);
    final CanteenWriteThrottle throttle=mock(CanteenWriteThrottle.class);
    final CanteenController controller=new CanteenController(service,mock(CanteenPhotoService.class),users,throttle);
    private User user(String role,int status) {
        User user=new User();user.setId(7L);user.setSchoolId(12L);user.setRole(role);user.setStatus(status);
        when(users.getById(7L)).thenReturn(user);return user;
    }
    @Test void disabledAndMissingAccountsCannotWrite() {
        assertThatThrownBy(()->controller.like(7L,1L,2L,new CanteenService.LikeInput(true))).hasMessageContaining("401");
        user("STUDENT",0);
        assertThatThrownBy(()->controller.rate(7L,1L,new CanteenService.RatingInput(5,null))).hasMessageContaining("401");
        assertThatThrownBy(()->controller.react(7L,1L,2L,new CanteenService.LikeInput(true))).hasMessageContaining("401");
        assertThatThrownBy(()->controller.reviewPage(7L,1L,0)).hasMessageContaining("401");
        verifyNoInteractions(service,throttle);
    }
    @Test void unknownRolesCannotVote() {
        user("UNKNOWN",1);
        assertThatThrownBy(()->controller.like(7L,1L,2L,new CanteenService.LikeInput(true))).hasMessageContaining("403");
        assertThatThrownBy(()->controller.rate(7L,1L,new CanteenService.RatingInput(5,null))).hasMessageContaining("403");
        assertThatThrownBy(()->controller.react(7L,1L,2L,new CanteenService.LikeInput(true))).hasMessageContaining("403");
        verifyNoInteractions(service,throttle);
    }
    @Test void newReviewReadsAndReactionsUseServerScopeAndCannotBeSharedCached() {
        user("STUDENT",1);
        assertThat(controller.reviewPage(7L,1L,20).getHeaders().getCacheControl()).isEqualTo("no-store");
        assertThat(controller.react(7L,1L,2L,new CanteenService.LikeInput(true)).getHeaders().getCacheControl()).isEqualTo("no-store");
        verify(service).reviewPage(12L,7L,1L,20);verify(service).react(12L,7L,1L,2L,true);verify(throttle).check(7L);
    }
    @Test void pagedReviewAndReactionHttpRoutesKeepTheirJsonContracts() throws Exception {
        user("STUDENT",1);
        var review=new CanteenService.PublicReview(2L,4,"合成公开短评",java.time.LocalDateTime.of(2026,11,1,12,0),false,"PUBLISHED",3,true);
        when(service.reviewPage(12L,7L,1L,20)).thenReturn(new CanteenService.ReviewPage(java.util.List.of(review),null,21,20,21,false));
        when(service.react(12L,7L,1L,2L,true)).thenReturn(review);
        var mvc=org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup(controller).build();
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/canteens/merchants/1/reviews/page?offset=20").requestAttr("currentUserId",7L))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.items[0].comment").value("合成公开短评"))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.nextOffset").value(21))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.hasMore").value(false));
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put("/api/canteens/merchants/1/reviews/2/reaction").requestAttr("currentUserId",7L).contentType("application/json").content("{\"liked\":true}"))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.likes").value(3))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.liked").value(true));
    }
    @Test void activeCampusRolesMaySubmitButStillUseOwnSchoolAndUser() {
        for (String role : java.util.List.of("ADMIN", "TEACHER", "COUNSELOR", "SECRETARY")) {
            user(role,1);
            controller.rate(7L,1L,new CanteenService.RatingInput(5,"校园用餐体验"));
        }
        verify(service,times(4)).rate(12L,7L,1L,5,"校园用餐体验");
        verify(throttle,times(4)).check(7L);
    }
    @Test void schoolAndVoterAreTakenFromActiveServerAccount() {
        user("STUDENT",1);
        controller.like(7L,1L,2L,new CanteenService.LikeInput(true));
        verify(throttle).check(7L);
        verify(service).like(12L,7L,1L,2L,true);
    }
}
