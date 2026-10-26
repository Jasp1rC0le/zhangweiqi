package com.campusai.knowledge.importing;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import java.nio.charset.StandardCharsets;
import static org.assertj.core.api.Assertions.assertThat;

@Timeout(5)
class OfficialHtmlContentTest {
    private OfficialHtmlContent.Result parse(String body) throws Exception {
        return OfficialHtmlContent.extract(("<html><head><meta charset='UTF-8'><title>官网标题</title></head><body>"
                + body + "</body></html>").getBytes(StandardCharsets.UTF_8), "https://jwc.tsguas.edu.cn/info/1/2.htm");
    }

    @Test void nestedCmsBodiesAreReadOnceWithoutSurroundingNews() throws Exception {
        var result = parse("<nav>菜单</nav><div id='vsb_newscontent'><div id='vsb_content'><p>办理时间</p>"
                + "<p>周一至周五</p></div></div><aside>本周活动</aside><footer>版权所有</footer>");
        assertThat(result.title()).isEqualTo("官网标题");
        assertThat(result.content()).isEqualTo("办理时间\n周一至周五");
        assertThat(result.warnings()).isEmpty();
    }
    @Test void deeplyNestedCmsNodesDoNotMaterializeQuadraticAncestorLists() throws Exception {
        var result = parse("<div class='v_news_content'>".repeat(15000)
                + "<p>只读一次正文</p>" + "</div>".repeat(15000));
        assertThat(result.content()).isEqualTo("只读一次正文");
    }
    @Test void rotatingRecommendationsDoNotChangeTheArticle() throws Exception {
        String article = "<div id='vsb_content_500'><p>联系电话28776001</p></div>";
        assertThat(parse("<nav>旧菜单</nav>" + article + "<aside>活动A</aside>").content())
                .isEqualTo(parse("<nav>新菜单</nav>" + article + "<aside>活动B</aside>").content());
    }
    @Test void siblingBodiesAndTableRowsAreNotDropped() throws Exception {
        var result = parse("<div id='vsb_content_1'><p>学生材料</p></div><div id='vsb_content_2'>"
                + "<table><tr><th>专业</th><th>最低分</th></tr><tr><td>数控</td><td>477</td></tr></table></div>");
        assertThat(result.content()).contains("学生材料", "专业", "最低分", "数控", "477");
        assertThat(result.content().indexOf("专业")).isLessThan(result.content().indexOf("数控"));
    }
    @Test void semanticArticleRemovesHiddenAndNavigationText() throws Exception {
        var result = parse("<nav>全站菜单</nav><article><nav>文章导航</nav><p>正文<br>第二行</p>"
                + "<span hidden>隐藏文本</span><script>令牌</script><style>样式</style></article><aside>新闻</aside>");
        assertThat(result.content()).isEqualTo("正文\n第二行");
        assertThat(result.warnings()).isEmpty();
    }
    @Test void imagesAndAttachmentsRemainExplicitlyUnverified() throws Exception {
        var result = parse("<div class='v_news_content'><p>附件如下</p><img alt='未核读图片' src='table.jpg'>"
                + "<a href='/system/_content/download.jsp?id=3'>申请表</a></div>");
        assertThat(result.content()).contains("申请表").doesNotContain("未核读图片");
        assertThat(result.warnings()).hasSize(2);
    }
    @Test void imageOnlyCmsDoesNotFallBackToNavigationAsContent() throws Exception {
        var result = parse("<nav>有文字的菜单</nav><div id='vsb_content'><img src='rule.jpg'></div>");
        assertThat(result.content()).isEmpty();
        assertThat(result.warnings()).hasSize(1);
    }
    @Test void attachmentsOutsideTheCmsBodyStillRequireReview() throws Exception {
        var result = parse("<div id='vsb_content'><p>请阅读办理要求</p></div>"
                + "<div><a href='/system/_content/download.jsp?id=5'>手册附件</a></div>");
        assertThat(result.content()).isEqualTo("请阅读办理要求");
        assertThat(result.warnings()).hasSize(1).allMatch(warning -> warning.contains("页面有下载附件"));
    }
    @Test void unknownLayoutIsMarkedAsPagePreviewNotATrustedSourceSnapshot() throws Exception {
        var result = parse("<nav>导航</nav><div><p>未知布局正文</p></div>");
        assertThat(result.content()).isEqualTo("未知布局正文");
        assertThat(result.warnings()).containsExactly(OfficialHtmlContent.FALLBACK_WARNING);
    }
}
