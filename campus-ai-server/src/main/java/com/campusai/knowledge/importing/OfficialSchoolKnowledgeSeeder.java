package com.campusai.knowledge.importing;

import com.campusai.dto.CreateKnowledgeDocumentRequest;
import com.campusai.mapper.SchoolMapper;
import com.campusai.service.KnowledgeDocumentService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;

/** Small, sourced starter set; later revisions must go through administrator review. */
@Component
public class OfficialSchoolKnowledgeSeeder {
    private static final Logger log = LoggerFactory.getLogger(OfficialSchoolKnowledgeSeeder.class);
    private final SchoolMapper schools;
    private final KnowledgeDocumentService documents;
    private final boolean enabled;

    public OfficialSchoolKnowledgeSeeder(SchoolMapper schools, KnowledgeDocumentService documents,
            @Value("${app.knowledge.seed-official-school:true}") boolean enabled) {
        this.schools = schools;
        this.documents = documents;
        this.enabled = enabled;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void importOfficialFacts() {
        if (!enabled) return;
        var matchingSchools = schools.findAllActive().stream()
                .filter(item -> "天津中德应用技术大学".equals(item.getName()))
                .toList();
        if (matchingSchools.isEmpty()) {
            log.warn("未找到天津中德应用技术大学，跳过官网资料初始化");
            return;
        }
        for (var school : matchingSchools) {
            importForSchool(school.getId());
        }
    }

    private void importForSchool(Long schoolId) {
        importOne(schoolId, "天津中德应用技术大学学校简介", "学校概况",
                "https://www.tsguas.edu.cn/xxgk.htm",
                "天津中德应用技术大学是天津市人民政府管理、天津市工业和信息化局举办的应用技术大学，接受天津市教育委员会业务指导。学校1985年开始企业员工培训，2001年改制为天津中德职业技术学院，2015年升格为天津中德应用技术大学，2021年获批硕士学位授予单位。校训为“崇实 求精 致良知”。学校位于天津海河教育园区雅深路2号。学校简介中的在校生、专业和师资数量统计截至2025年9月，查询现时数量时应以官网最新数据为准。",
                null);
        importOne(schoolId, "天津中德应用技术大学地址与官方咨询渠道", "校园服务",
                "https://www.tsguas.edu.cn/",
                "天津中德应用技术大学地址：天津海河教育园区雅深路2号；邮编：300350。党委办公室、校长办公室电话：022-28776000，传真：022-28776877。本专科招生咨询电话：022-28776099、022-28776655；研究生招生咨询电话：022-28776599。2026年10月4日核验，本专科号码采用招生部门官网 https://zs.tsguas.edu.cn/ 的公开联系方式。学校官网 https://www.tsguas.edu.cn/ 提供数字校园、信息公开、招生就业、教学科研和中德校历等入口；号码更新以招生官网及招生办确认为准。",
                LocalDateTime.of(2027, 3, 20, 0, 0));
        importOne(schoolId, "中德应大2026年春季大型校园双选会", "就业招聘",
                "https://www.tsguas.edu.cn/info/1004/3110.htm",
                "天津中德应用技术大学官网2026年3月17日报道：学校2026届毕业生春季大型校园双选会由学校与津南区人社局、经济开发区人社局、滨海高新区人社局、西青区人社局、武清区人社局、东丽区人社局共同主办。活动吸引奥特赛斯、赛象科技、立林机械、肯拓智能装备等170家企业，提供近3000个岗位需求，3500余名学生参加，近千人达成初步意向。该内容是已结束活动记录，不代表这些企业当前仍在招聘；实时岗位必须核验企业或学校最新通知。",
                LocalDateTime.of(2027, 3, 17, 0, 0));
        importOne(schoolId, "中德应大2027届毕业生首场大型校园双选会", "就业招聘",
                "https://www.tsguas.edu.cn/info/1004/3340.htm",
                "天津中德应用技术大学官网2026年9月16日报道：学校2027届毕业生首场大型校园双选会集结175家企业，覆盖高端装备制造、轻工业、航空航天、智能机器人等12条重点产业链，投放1700余个岗位，近2000名海河教育园区各院校应届毕业生到场。该内容是招聘会活动记录，不能据此断言某个具体岗位仍有效；实时招聘信息必须以企业或学校最新页面为准。",
                LocalDateTime.of(2027, 9, 16, 0, 0));
    }

    private void importOne(Long schoolId, String title, String category,
            String sourceUrl, String content, LocalDateTime expiresAt) {
        CreateKnowledgeDocumentRequest request = new CreateKnowledgeDocumentRequest();
        request.setSchoolId(schoolId);
        request.setTitle(title);
        request.setCategory(category);
        request.setSourceDepartment("天津中德应用技术大学官网");
        request.setSourceUrl(sourceUrl);
        request.setContent(content);
        request.setExpiresAt(expiresAt);
        try {
            var result = documents.importDocument(request);
            log.info("官网资料初始化：{}，资料编号 {}，重复 {}", title, result.documentId(), result.duplicate());
        } catch (ResponseStatusException exception) {
            log.warn("官网资料 {} 已存在或与现有资料冲突，未自动覆盖：{}", title, exception.getReason());
        } catch (DataAccessException exception) {
            log.error("官网资料 {} 未能导入学校 {}；请检查数据库约束", title, schoolId, exception);
        }
    }
}
