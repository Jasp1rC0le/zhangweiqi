package com.campusai.controller;
import com.campusai.wall.*;
import com.campusai.service.UserService;
import com.campusai.user.entity.User;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
class WallControllerTest {
    final WallService wall=mock(WallService.class);
    final UserService users=mock(UserService.class);
    final WallThrottle throttle=mock(WallThrottle.class);
    final WallController controller=new WallController(wall,users,throttle);
    User user(String role,int status){User u=new User();u.setId(7L);u.setRole(role);u.setStatus(status);u.setSchoolId(12L);when(users.getById(7L)).thenReturn(u);return u;}
    @Test void missingDisabledAndSchoollessUsersCannotAccess(){
        assertThatThrownBy(()->controller.list(7L,"",false,0)).hasMessageContaining("401");
        user("STUDENT",0);assertThatThrownBy(()->controller.list(7L,"",false,0)).hasMessageContaining("401");
        user("STUDENT",1).setSchoolId(null);assertThatThrownBy(()->controller.list(7L,"",false,0)).hasMessageContaining("403");verifyNoInteractions(wall);
    }
    @Test void studentsCannotModerateEvenWhenCallingApiDirectly(){
        user("STUDENT",1);assertThatThrownBy(()->controller.queue(7L)).hasMessageContaining("403");
        assertThatThrownBy(()->controller.context(7L,"x")).hasMessageContaining("403");
        assertThatThrownBy(()->controller.review(7L,"x",new WallService.ReviewInput(1,"PUBLISHED",""))).hasMessageContaining("403");verifyNoInteractions(wall);
    }
    @Test void identityAndSchoolAreReadFromServer(){
        user("STUDENT",1);controller.like(7L,"x",new WallController.Like(true));verify(wall).like(12L,7L,"x",true);verify(throttle).check(7L);
        user("ADMIN",1);controller.queue(7L);verify(wall).queue(12L,7L);
    }
}
