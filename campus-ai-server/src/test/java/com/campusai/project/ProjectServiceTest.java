package com.campusai.project;

import tools.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.web.server.ResponseStatusException;
import javax.sql.DataSource;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import static org.assertj.core.api.Assertions.*;

@SpringJUnitConfig(ProjectServiceTest.Config.class)
class ProjectServiceTest {
    @Configuration @EnableTransactionManagement
    static class Config {
        @Bean DataSource dataSource() { return new DriverManagerDataSource("jdbc:h2:mem:projecttests;MODE=MySQL;DB_CLOSE_DELAY=-1", "sa", ""); }
        @Bean JdbcTemplate jdbc(DataSource ds) { return new JdbcTemplate(ds); }
        @Bean PlatformTransactionManager transactions(DataSource ds) { return new DataSourceTransactionManager(ds); }
        @Bean ProjectService projects(JdbcTemplate jdbc) { return new ProjectService(jdbc, new ObjectMapper()); }
    }
    @Autowired JdbcTemplate jdbc;
    @Autowired ProjectService service;
    String id;
    @BeforeEach void setup() throws Exception {
        jdbc.execute("DROP ALL OBJECTS");
        jdbc.execute("CREATE TABLE users(id BIGINT PRIMARY KEY)");
        jdbc.update("INSERT INTO users(id) VALUES(1),(2)");
        String schema = new ClassPathResource("schema.sql").getContentAsString(StandardCharsets.UTF_8);
        for (String sql : schema.substring(schema.indexOf("CREATE TABLE IF NOT EXISTS student_projects"),schema.indexOf("CREATE TABLE IF NOT EXISTS campus_wall_entries")).split(";"))
            if (!sql.isBlank()) jdbc.execute(sql);
        id = UUID.randomUUID().toString();
    }
    ProjectContent content(String title) {
        return new ProjectContent(title, "business", LocalDate.of(2026, 10, 1), "说明数据来源", "来自课程问卷", List.of(
                new ProjectContent.Requirement("r1", "说明数据来源", 1, "说明数据来源", true, true, "来自课程问卷", "")));
    }
    @Test void createsPersistsAndRetriesWithoutDuplicateVersions() {
        var first = service.create(1L, id, content("报告"));
        assertThat(first.content()).isEqualTo(content("报告"));
        assertThat(first.revision()).isEqualTo(1);
        assertThat(service.create(1L, id, content("报告")).revision()).isEqualTo(1);
        assertThat(service.versions(1L, id)).hasSize(1);
        assertThat(service.list(1L)).hasSize(1);
        assertThat(service.list(2L)).isEmpty();
    }
    @Test void dataSheetPersistsAcrossVersionsAndOlderProjectsRemainReadable() {
        var first = content("旧项目");
        service.create(1L, id, first);
        var sheet = new ProjectContent.DataSheet("id,m,r\na,12,10", "测试记录", 1, 2, "V", true, new java.math.BigDecimal("5"));
        var updated = new ProjectContent(first.title(), first.track(), first.deadline(), first.brief(), first.manuscript(), first.requirements(), sheet);
        service.save(1L, id, 1, updated, false);
        assertThat(service.get(1L, id).content().dataSheet()).isEqualTo(sheet);
        assertThat(service.version(1L, id, 1).dataSheet()).isNull();
        assertThat(service.version(1L, id, 2).dataSheet()).isEqualTo(sheet);
        service.save(1L, id, 2, service.version(1L, id, 1), false);
        assertThat(service.get(1L, id).content().dataSheet()).isNull();
        assertThat(service.version(1L, id, 2).dataSheet()).isEqualTo(sheet);
    }
    @Test void calculationSettingsPersistWithVersionWithoutExecutingCode() {
        var original=content("公式测试");
        service.create(1L,id,original);
        var calculation=new ProjectContent.Calculation("x*y",0,1,2,"件","元/件","元",true,new java.math.BigDecimal("0.000001"));
        var sheet=new ProjectContent.DataSheet("数量,单价,金额\n2,5,10","合成数据",-1,-1,"",false,new java.math.BigDecimal("5"),calculation);
        var updated=new ProjectContent(original.title(),original.track(),original.deadline(),original.brief(),original.manuscript(),original.requirements(),sheet);
        service.save(1L,id,1,updated,false);
        assertThat(service.version(1L,id,2).dataSheet().calculation()).isEqualTo(calculation);
        assertThat(service.version(1L,id,1).dataSheet()).isNull();
        assertThatThrownBy(()->service.version(2L,id,2)).hasMessageContaining("404");
    }
    @Test void retryWithChangedDraftDoesNotDiscardEdits() {
        service.create(1L, id, content("原版"));
        assertThatThrownBy(() -> service.create(1L, id, content("新草稿"))).isInstanceOf(ResponseStatusException.class).hasMessageContaining("随后发生变化");
        assertThat(service.get(1L, id).content().title()).isEqualTo("原版");
    }
    @Test void feedbackIsPrivateVersionedAndDoesNotChangeRequirements() {
        var original = content("复核");
        service.create(1L, id, original);
        var feedback = new ProjectContent.ReviewFeedback("r1", "说明来源", "a".repeat(64), "本人认为不适用，待教师确认");
        var next = new ProjectContent(original.title(), original.track(), original.deadline(), original.brief(), original.manuscript(), original.requirements(), null, List.of(feedback));
        service.save(1L, id, 1, next, false);
        assertThat(service.version(1L, id, 1).reviewFeedback()).isNull();
        assertThat(service.version(1L, id, 2).reviewFeedback()).containsExactly(feedback);
        assertThat(service.get(1L, id).content().requirements()).isEqualTo(original.requirements());
        assertThatThrownBy(() -> service.version(2L, id, 2)).hasMessageContaining("404");
        var duplicate = new ProjectContent(original.title(), original.track(), null, "", "", List.of(), null, List.of(feedback, feedback));
        assertThatThrownBy(() -> service.save(1L, id, 2, duplicate, false)).hasMessageContaining("复核记录标识不能重复");
        assertThat(service.get(1L, id).revision()).isEqualTo(2);
    }
    @Test void everyReadAndWriteRejectsOtherOwner() {
        service.create(1L, id, content("私有项目"));
        assertThatThrownBy(() -> service.get(2L, id)).hasMessageContaining("404");
        assertThatThrownBy(() -> service.save(2L, id, 1, content("盗改"), false)).hasMessageContaining("404");
        assertThatThrownBy(() -> service.versions(2L, id)).hasMessageContaining("404");
        assertThatThrownBy(() -> service.version(2L, id, 1)).hasMessageContaining("404");
        assertThatThrownBy(() -> service.delete(2L, id, 1)).hasMessageContaining("404");
        assertThat(service.get(1L, id).revision()).isEqualTo(1);
    }
    @Test void staleSaveAndDeleteCannotOverwriteAnotherTab() {
        service.create(1L, id, content("原版"));
        service.save(1L, id, 1, content("第二版"), true);
        assertThatThrownBy(() -> service.save(1L, id, 1, content("过期草稿"), false)).hasMessageContaining("409");
        assertThatThrownBy(() -> service.delete(1L, id, 1)).hasMessageContaining("409");
        assertThat(service.get(1L, id).archived()).isTrue();
        assertThat(service.get(1L, id).content().title()).isEqualTo("第二版");
        assertThat(service.version(1L, id, 1).title()).isEqualTo("原版");
    }
    @Test void restoringIsANewVersionAndRetentionIsBounded() {
        service.create(1L, id, content("原版"));
        service.save(1L, id, 1, content("修改"), false);
        service.save(1L, id, 2, service.version(1L, id, 1), false);
        assertThat(service.version(1L, id, 2).title()).isEqualTo("修改");
        assertThat(service.get(1L, id).content().title()).isEqualTo("原版");
        for (int version = 3; version < 52; version++) service.save(1L, id, version, content("版本" + version), false);
        assertThat(service.versions(1L, id)).hasSize(50);
        assertThatThrownBy(() -> service.version(1L, id, 1)).hasMessageContaining("404");
    }
    @Test void versionWriteFailureRollsBackCurrentSnapshot() {
        service.create(1L, id, content("原版"));
        jdbc.update("INSERT INTO student_project_versions(project_id,revision,content_json) VALUES(?,2,'{}')", id);
        assertThatThrownBy(() -> service.save(1L, id, 1, content("不能部分保存"), false)).isInstanceOf(RuntimeException.class);
        assertThat(service.get(1L, id).revision()).isEqualTo(1);
        assertThat(service.get(1L, id).content().title()).isEqualTo("原版");
    }
    @Test void deletionAndAccountDeletionCascadeVersions() {
        service.create(1L, id, content("临时"));
        service.delete(1L, id, 1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM student_project_versions", Long.class)).isZero();
        service.create(1L, id, content("再次创建"));
        jdbc.update("DELETE FROM users WHERE id=1");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM student_projects", Long.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM student_project_versions", Long.class)).isZero();
    }
    @Test void rejectsDuplicateRequirementIdsAndOversizedPayloads() {
        var original = content("报告");
        var duplicate = new ProjectContent("报告", "business", null, "", "", List.of(original.requirements().get(0), original.requirements().get(0)));
        assertThatThrownBy(() -> service.create(1L, id, duplicate)).hasMessageContaining("标识不能重复");
        assertThatThrownBy(() -> service.create(1L, id, new ProjectContent("报告", "business", null, "", "a".repeat(150001), List.of()))).hasMessageContaining("文本过大");
        assertThat(service.list(1L)).isEmpty();
    }
}
