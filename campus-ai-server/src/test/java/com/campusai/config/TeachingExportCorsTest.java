package com.campusai.config;

import com.campusai.security.*;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.mock.web.*;
import org.springframework.web.cors.*;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import java.util.Map;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;

class TeachingExportCorsTest {
    static class Registry extends CorsRegistry {Map<String,CorsConfiguration> mappings(){return getCorsConfigurations();}}
    @Test void trustedCrossOriginDownloadExposesOnlyTheChecksumWithoutBroadeningOrigins()throws Exception{
        var web=new WebConfig(mock(JwtInterceptor.class),"http://localhost:5173",new MockEnvironment(),false,mock(PublicWriteThrottle.class),mock(TeachingRequestGate.class));
        var registry=new Registry();web.addCorsMappings(registry);var config=registry.mappings().get("/api/**");assertEquals(java.util.List.of("X-Content-SHA256"),config.getExposedHeaders());
        var request=new MockHttpServletRequest("POST","/api/teaching/governance/export");request.addHeader("Origin","http://localhost:5173");var response=new MockHttpServletResponse();
        assertTrue(new DefaultCorsProcessor().processRequest(config,request,response));assertEquals("X-Content-SHA256",response.getHeader("Access-Control-Expose-Headers"));assertEquals("http://localhost:5173",response.getHeader("Access-Control-Allow-Origin"));
        request=new MockHttpServletRequest("POST","/api/teaching/governance/export");request.addHeader("Origin","https://untrusted.invalid");response=new MockHttpServletResponse();assertFalse(new DefaultCorsProcessor().processRequest(config,request,response));assertNull(response.getHeader("Access-Control-Allow-Origin"));
    }
}
