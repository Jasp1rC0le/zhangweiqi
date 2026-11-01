package com.campusai.controller;

import com.campusai.operations.WebsiteStatisticsService;
import com.campusai.service.UserService;
import com.campusai.user.entity.User;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import java.time.*;
import java.util.List;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class AdminWebsiteStatisticsControllerTest {
    final WebsiteStatisticsService service=mock(WebsiteStatisticsService.class);
    final UserService users=mock(UserService.class);
    final AdminWebsiteStatisticsController controller=new AdminWebsiteStatisticsController(service,users);
    User admin(){var user=new User();user.setId(7L);user.setSchoolId(2L);user.setRole("ADMIN");user.setStatus(1);when(users.getById(7L)).thenReturn(user);return user;}
    @Test void nonAdminsDisabledAccountsAndRevokedRolesCannotReadAggregates(){
        assertThatThrownBy(()->controller.read(7L,"STUDENT",7)).hasMessageContaining("403");verifyNoInteractions(users,service);
        var user=admin();user.setStatus(0);assertThatThrownBy(()->controller.read(7L,"ADMIN",7)).hasMessageContaining("403");
        user.setStatus(1);user.setRole("STUDENT");assertThatThrownBy(()->controller.read(7L,"ADMIN",7)).hasMessageContaining("403");
        user.setRole("ADMIN");user.setSchoolId(null);assertThatThrownBy(()->controller.read(7L,"ADMIN",7)).hasMessageContaining("403");verifyNoInteractions(service);
    }
    @Test void httpUsesTheActiveAccountsSchoolReturnsOnlyAggregatesAndDisablesCaching()throws Exception{
        admin();var day=LocalDate.of(2026,11,1);
        var stats=new WebsiteStatisticsService.Statistics(7,day.minusDays(6),day,Instant.parse("2026-11-01T06:00:00Z"),"Asia/Shanghai","SAVED_RECORDS",2,1,1,List.of(new WebsiteStatisticsService.Feature("QUESTION",1)),List.of(),0,0);
        when(service.read(2L,7)).thenReturn(stats);
        var mvc=MockMvcBuilders.standaloneSetup(controller).build();
        mvc.perform(get("/api/admin/website-statistics?days=7&schoolId=99").requestAttr("currentUserId",7L).requestAttr("currentUserRole","ADMIN"))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store"))
                .andExpect(jsonPath("$.totalAccounts").value(2)).andExpect(jsonPath("$.features[0].participants").value(1))
                .andExpect(jsonPath("$.userId").doesNotExist()).andExpect(jsonPath("$.users").doesNotExist()).andExpect(jsonPath("$.content").doesNotExist());
        verify(service).read(2L,7);
    }
    @Test void databaseFailureIsUnavailableRatherThanFakeZerosOrRawSqlDetails(){
        admin();when(service.read(2L,7)).thenThrow(new DataAccessResourceFailureException("private database details"));
        assertThatThrownBy(()->controller.read(7L,"ADMIN",7)).hasMessageContaining("503").hasMessageNotContaining("private database details");
    }
}
