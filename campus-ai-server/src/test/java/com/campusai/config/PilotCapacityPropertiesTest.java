package com.campusai.config;

import com.zaxxer.hikari.HikariConfig;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.boot.jdbc.autoconfigure.JdbcProperties;
import org.springframework.boot.tomcat.autoconfigure.TomcatServerProperties;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.core.io.ClassPathResource;
import java.time.Duration;
import static org.junit.jupiter.api.Assertions.*;

class PilotCapacityPropertiesTest {
    @Test void optionalPilotProfileBindsToActualBootAndHikariPropertiesWithoutEnablingTeaching() throws Exception {
        var env=new StandardEnvironment();env.getPropertySources().addFirst(new YamlPropertySourceLoader().load("pilot",new ClassPathResource("application-pilot-4g.yml")).get(0));
        var binder=Binder.get(env);
        var tomcat=binder.bind("server.tomcat",TomcatServerProperties.class).get();
        assertEquals(64,tomcat.getThreads().getMax());assertEquals(64,tomcat.getThreads().getMaxQueueCapacity());assertEquals(256,tomcat.getMaxConnections());assertEquals(32,tomcat.getAcceptCount());
        var pool=binder.bind("spring.datasource.hikari",HikariConfig.class).get();assertEquals(8,pool.getMaximumPoolSize());assertEquals(2,pool.getMinimumIdle());assertEquals(2000,pool.getConnectionTimeout());assertEquals(1000,pool.getValidationTimeout());
        var jdbc=binder.bind("spring.jdbc",JdbcProperties.class).get();assertEquals(Duration.ofSeconds(3),jdbc.getTemplate().getQueryTimeout());
        assertEquals("never",env.getProperty("spring.sql.init.mode"));assertEquals("127.0.0.1",env.getProperty("server.address"));assertEquals("false",env.getProperty("app.web-search.enabled"));assertNull(env.getProperty("app.teaching.enabled"));assertNull(env.getProperty("app.teaching.identity-enabled"));
    }
}
