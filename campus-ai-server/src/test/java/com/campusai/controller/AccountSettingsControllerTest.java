package com.campusai.controller;

import com.campusai.security.*;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import java.util.function.BooleanSupplier;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class AccountSettingsControllerTest {
    @Test void routesUseCurrentIdentityValidateInputAndNeverReturnCredentialsOrOverwriteCookies()throws Exception{
        var settings=mock(AccountSettingsService.class);var sessions=mock(AuthSessionService.class);var throttle=mock(LoginThrottle.class);
        when(sessions.active("sid",7L,"STUDENT")).thenReturn(true);
        when(settings.nickname(eq(7L),eq("新昵称"),any())).thenAnswer(call->{assertThat(((BooleanSupplier)call.getArgument(2)).getAsBoolean()).isTrue();return new AccountSettingsService.Nickname("新昵称");});
        doAnswer(call->{assertThat(((BooleanSupplier)call.getArgument(3)).getAsBoolean()).isTrue();return null;}).when(settings).password(eq(7L),eq("old-password"),eq("new-password"),any());
        var mvc=MockMvcBuilders.standaloneSetup(new AccountSettingsController(settings,sessions,throttle)).build();
        mvc.perform(put("/api/account/nickname").requestAttr("currentUserId",7L).requestAttr("currentSessionId","sid").requestAttr("currentUserRole","STUDENT").contentType("application/json").content("{\"nickname\":\"新昵称\"}"))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store")).andExpect(jsonPath("$.nickname").value("新昵称")).andExpect(jsonPath("$.role").doesNotExist()).andExpect(jsonPath("$.password_hash").doesNotExist());
        mvc.perform(post("/api/account/password").requestAttr("currentUserId",7L).requestAttr("currentSessionId","sid").requestAttr("currentUserRole","STUDENT").contentType("application/json").content("{\"currentPassword\":\"old-password\",\"password\":\"new-password\"}"))
                .andExpect(status().isNoContent()).andExpect(header().string("Cache-Control","no-store")).andExpect(header().doesNotExist("Set-Cookie"));
        verify(settings).password(eq(7L),eq("old-password"),eq("new-password"),any());
        mvc.perform(put("/api/account/nickname").requestAttr("currentUserId",7L).requestAttr("currentSessionId","sid").requestAttr("currentUserRole","STUDENT").contentType("application/json").content("{\"nickname\":\" \"}"))
                .andExpect(status().isBadRequest());
    }
}
