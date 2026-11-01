package com.campusai.controller;

import com.campusai.security.*;
import com.campusai.timetable.CalendarLinkService;
import com.campusai.exception.UnauthorizedException;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.*;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import java.nio.charset.StandardCharsets;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class CalendarLinkHttpTest {
    final String token="a".repeat(64)+"."+"A".repeat(43),path="/api/calendar-feed/"+token+"/calendar.ics";
    @Test void onlyTheExactReadOnlyRouteCanReachItsSeparateProofValidator() {
        var jwt=mock(JwtService.class);var sessions=mock(AuthSessionService.class);var gate=new JwtInterceptor(jwt,sessions);
        for(String method:new String[]{"GET","HEAD"})assertTrue(gate.preHandle(new MockHttpServletRequest(method,path),new MockHttpServletResponse(),new Object()));
        for(var request:new MockHttpServletRequest[]{new MockHttpServletRequest("POST",path),new MockHttpServletRequest("GET",path+"/private"),new MockHttpServletRequest("GET","/api/timetable/calendar-link"),new MockHttpServletRequest("GET","/api/admin/users")})
            assertThrows(UnauthorizedException.class,()->gate.preHandle(request,new MockHttpServletResponse(),new Object()));
        verifyNoInteractions(jwt,sessions);
    }
    @Test void aValidCalendarIsInlineNoStoreAndDoesNotNeedABrowserCookie()throws Exception{
        var service=mock(CalendarLinkService.class);byte[] bytes="BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n".getBytes(StandardCharsets.UTF_8);
        when(service.read(token)).thenReturn(new CalendarLinkService.Calendar(bytes,"a".repeat(64)));
        var mvc=MockMvcBuilders.standaloneSetup(new CalendarLinkController(service,mock(AuthSessionService.class))).build();
        mvc.perform(get(path)).andExpect(status().isOk()).andExpect(content().contentTypeCompatibleWith("text/calendar"))
                .andExpect(header().string("Cache-Control","no-store")).andExpect(header().string("Referrer-Policy","no-referrer"))
                .andExpect(header().string("X-Content-SHA256","a".repeat(64))).andExpect(content().bytes(bytes));
        mvc.perform(head(path)).andExpect(status().isOk()).andExpect(header().string("Content-Length",Integer.toString(bytes.length)));
    }
    @Test void invalidAndUnexpectedFailuresNeverEchoPrivateAddressesOrInternalErrors()throws Exception{
        var service=mock(CalendarLinkService.class);var mvc=MockMvcBuilders.standaloneSetup(new CalendarLinkController(service,mock(AuthSessionService.class))).build();
        when(service.read(token)).thenThrow(new ResponseStatusException(HttpStatus.NOT_FOUND,"synthetic-private-detail"));
        mvc.perform(get(path)).andExpect(status().isNotFound()).andExpect(content().bytes(new byte[0]));
        doThrow(new IllegalStateException("synthetic-internal-detail")).when(service).read(token);
        mvc.perform(get(path)).andExpect(status().isServiceUnavailable()).andExpect(content().bytes(new byte[0]));
    }
}
