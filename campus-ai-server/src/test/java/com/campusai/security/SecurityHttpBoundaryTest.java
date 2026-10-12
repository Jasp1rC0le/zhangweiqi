package com.campusai.security;

import com.campusai.exception.GlobalExceptionHandler;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.containsString;

class SecurityHttpBoundaryTest {
    @RestController static class Probe {
        @PostMapping("/api/auth/login") public java.util.Map<String,String> login(@RequestBody java.util.Map<String,String> body) {
            return java.util.Map.of("status","ok");
        }
        @GetMapping("/api/probe") public String fail() {
            throw new org.springframework.dao.DataAccessResourceFailureException("jdbc:mysql://private-host SECRET_PASSWORD");
        }
    }
    private final org.springframework.test.web.servlet.MockMvc mvc = MockMvcBuilders.standaloneSetup(new Probe())
            .setControllerAdvice(new GlobalExceptionHandler())
            .addFilters(new ApiBoundaryFilter("https://campus.example")).build();

    @Test void validBrowserPostWorksAndMalformedBodyDoesNotLeak() throws Exception {
        mvc.perform(post("/api/auth/login").header("Origin","https://campus.example")
                .contentType(MediaType.APPLICATION_JSON).content("{\"username\":\"student\"}"))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store"));
        mvc.perform(post("/api/auth/login").header("Origin","https://campus.example")
                .contentType(MediaType.APPLICATION_JSON).content("SECRET_PRIVATE_PAYLOAD"))
                .andExpect(status().isBadRequest()).andExpect(content().string(not(containsString("SECRET_PRIVATE_PAYLOAD"))));
    }
    @Test void forgedLoginNeverReachesControllerAndDatabaseErrorsStayGeneric() throws Exception {
        mvc.perform(post("/api/auth/login").header("Origin","https://evil.example")
                .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isForbidden()).andExpect(header().string("Cache-Control","no-store"));
        mvc.perform(get("/api/probe")).andExpect(status().isInternalServerError())
                .andExpect(header().string("Cache-Control","no-store"))
                .andExpect(content().string(not(containsString("private-host"))))
                .andExpect(content().string(not(containsString("SECRET_PASSWORD"))));
    }
    @Test void methodErrorsRemainClientErrors() throws Exception {
        mvc.perform(get("/api/auth/login")).andExpect(status().isMethodNotAllowed());
    }
}
