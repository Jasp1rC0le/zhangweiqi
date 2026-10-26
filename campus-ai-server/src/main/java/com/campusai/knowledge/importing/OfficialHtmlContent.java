package com.campusai.knowledge.importing;

import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.nodes.Node;
import org.jsoup.nodes.TextNode;
import org.jsoup.select.NodeTraversor;
import org.jsoup.select.NodeVisitor;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;

/** Extracts school CMS bodies without navigation and rotating recommendation lists. */
final class OfficialHtmlContent {
    static final String FALLBACK_WARNING = "未定位独立正文，当前为页面文字预览；不能据此判断官网正文更新";
    private static final String CMS_BODY = "#vsb_newscontent, [id^=vsb_content], .v_news_content";

    record Result(String title, String content, List<String> warnings) {}

    static Result extract(byte[] bytes, String baseUrl) throws IOException {
        // Null charset honors the page's declared encoding; this parser never fetches resources.
        Document page = Jsoup.parse(new ByteArrayInputStream(bytes), null, baseUrl == null ? "" : baseUrl);
        String title = page.title();
        page.select("script, style, link, noscript, template").remove();
        List<Element> roots = new ArrayList<>();
        var candidates = page.select(CMS_BODY);
        var selected = new HashSet<>(candidates);
        for (Element element : candidates) {
            // Do not allocate every ancestor for every nested CMS div (quadratic on hostile HTML).
            boolean nested = false;
            for (Element parent = element.parent(); parent != null; parent = parent.parent()) {
                if (selected.contains(parent)) { nested = true; break; }
            }
            if (!nested) roots.add(element);
        }
        if (roots.isEmpty()) {
            Element semantic = page.selectFirst("article, main, [role=main]");
            if (semantic != null) roots.add(semantic);
        }
        boolean fallback = roots.isEmpty();
        if (fallback) roots.add(page.body());
        List<String> warnings = new ArrayList<>();
        if (fallback) warnings.add(FALLBACK_WARNING);
        // The school CMS often renders its attachment list after, not inside, the article div.
        if (!page.select("a[href*=download]").isEmpty()) {
            warnings.add("页面有下载附件，需另行核读；文字预览不等于附件已解析");
        }
        StringBuilder body = new StringBuilder();
        for (Element root : roots) {
            root.select("nav, header, footer, aside, [aria-hidden=true], [hidden]").remove();
            if (!root.select("img").isEmpty()) warnings.add("正文含图片，文字预览不包含图片里的表格或说明，请核读原图");
            if (!root.select("iframe, object, embed").isEmpty()) {
                warnings.add("正文有嵌入文件，需另行核读；文字预览不等于文件已解析");
            }
            appendText(root, body);
            body.append('\n');
        }
        String content = body.toString().replace('\u00a0', ' ')
                .replaceAll("[\\t \\x0B\\f]+", " ")
                .replaceAll(" *\\n *", "\n").replaceAll("\\n{3,}", "\n\n").strip();
        return new Result(title, content, warnings.stream().distinct().toList());
    }

    private static void appendText(Element root, StringBuilder output) {
        NodeTraversor.traverse(new NodeVisitor() {
            @Override public void head(Node node, int depth) {
                if (node instanceof TextNode text) output.append(text.getWholeText());
                else if (node instanceof Element element && element.normalName().equals("br")) output.append('\n');
            }
            @Override public void tail(Node node, int depth) {
                if (node instanceof Element element) {
                    if (element.normalName().equals("td") || element.normalName().equals("th")) output.append('\t');
                    else if (element.isBlock() && !element.normalName().equals("br")) output.append('\n');
                }
            }
        }, root);
    }
}
