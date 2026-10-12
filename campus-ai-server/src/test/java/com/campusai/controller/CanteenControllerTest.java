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
        verifyNoInteractions(service,throttle);
    }
    @Test void adminDoesNotGetToCastStudentVotes() {
        user("ADMIN",1);
        assertThatThrownBy(()->controller.like(7L,1L,2L,new CanteenService.LikeInput(true))).hasMessageContaining("403");
        assertThatThrownBy(()->controller.rate(7L,1L,new CanteenService.RatingInput(5,null))).hasMessageContaining("403");
        verifyNoInteractions(service,throttle);
    }
    @Test void schoolAndVoterAreTakenFromActiveServerAccount() {
        user("STUDENT",1);
        controller.like(7L,1L,2L,new CanteenService.LikeInput(true));
        verify(throttle).check(7L);
        verify(service).like(12L,7L,1L,2L,true);
    }
}
