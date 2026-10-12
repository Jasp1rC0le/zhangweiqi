package com.campusai.career;

import com.campusai.mapper.SchoolMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Component;

/** Seeds reviewable leads from school-owned pages; nothing is published automatically. */
@Component
public class OfficialEmployerCandidateSeeder {
    private static final Logger log = LoggerFactory.getLogger(OfficialEmployerCandidateSeeder.class);

    private final SchoolMapper schools;
    private final EmployerDiscoveryService discovery;
    private final boolean enabled;

    public OfficialEmployerCandidateSeeder(SchoolMapper schools, EmployerDiscoveryService discovery,
            @Value("${app.career.seed-official-candidates:true}") boolean enabled) {
        this.schools = schools;
        this.discovery = discovery;
        this.enabled = enabled;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void seed() {
        if (!enabled) return;
        schools.findAllActive().stream()
                .filter(school -> "天津中德应用技术大学".equals(school.getName()))
                .forEach(school -> seedForSchool(school.getId()));
    }

    private void seedForSchool(Long schoolId) {
        try {
            String springFair = "https://www.tsguas.edu.cn/info/1004/3110.htm";
            String springSummary = "学校2026年春季大型校园双选会公开列举的参会企业之一；具体岗位和有效期须继续核验。";
            discovery.seedOfficialCandidate(schoolId, "奥特赛斯", springFair, springSummary, "2026-03-17");
            discovery.seedOfficialCandidate(schoolId, "赛象科技", springFair, springSummary, "2026-03-17");
            discovery.seedOfficialCandidate(schoolId, "立林机械", springFair, springSummary, "2026-03-17");
            discovery.seedOfficialCandidate(schoolId, "肯拓智能装备", springFair, springSummary, "2026-03-17");

            discovery.seedOfficialCandidate(schoolId, "天津阿童木机器人股份有限公司",
                    "https://znzz.tsguas.edu.cn/info/1135/3597.htm",
                    "智能制造学院2026年访企拓岗报道涉及的企业，合作及招聘状态须由管理员再次核验。",
                    "2026-05-28");
            discovery.seedOfficialCandidate(schoolId, "奥克福（苏州）科技有限公司天津研究院",
                    "https://znzz.tsguas.edu.cn/info/1135/3564.htm",
                    "智能制造学院2026年校企合作报道涉及的企业，具体合作范围须以原始页面为准。",
                    "2026-03-26");
            discovery.seedOfficialCandidate(schoolId, "国瑞达（天津）科技有限公司",
                    "https://xxtx.tsguas.edu.cn/info/1011/3755.htm",
                    "软件与通信学院企业专场招聘宣讲会公开列举的企业，当前岗位须重新核验。",
                    "2025-05-30");
            discovery.seedOfficialCandidate(schoolId, "嘉兴斯达半导体有限公司",
                    "https://xxtx.tsguas.edu.cn/info/1011/3755.htm",
                    "软件与通信学院企业专场招聘宣讲会公开列举的企业，当前岗位须重新核验。",
                    "2025-05-30");
            log.info("已为学校 {} 更新官网企业线索候选池", schoolId);
        } catch (DataAccessException exception) {
            log.error("官网企业线索初始化失败，请检查候选表结构", exception);
        }
    }
}
