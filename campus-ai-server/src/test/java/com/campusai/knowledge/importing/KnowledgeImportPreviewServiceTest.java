package com.campusai.knowledge.importing;

import com.campusai.mapper.KnowledgeDocumentMapper;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.util.ReflectionTestUtils;
import com.campusai.dto.KnowledgeImportPreview;
import org.springframework.web.server.ResponseStatusException;
import java.io.ByteArrayOutputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpHeaders;
import java.net.http.HttpResponse;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Flow;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

class KnowledgeImportPreviewServiceTest {
    private final KnowledgeImportPreviewService service = new KnowledgeImportPreviewService(
            mock(KnowledgeDocumentMapper.class), "tsguas.edu.cn");

    @Test
    void shouldPreviewWordWithoutPublishing() throws Exception {
        byte[] bytes;
        try (XWPFDocument document = new XWPFDocument();
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            document.createParagraph().createRun().setText("图书馆工作日开放时间以官网通知为准");
            document.write(output);
            bytes = output.toByteArray();
        }
        var file = new MockMultipartFile("files", "图书馆通知.docx",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document", bytes);
        var preview = service.files(1L, new MockMultipartFile[]{file}).get(0);
        assertThat(preview.title()).isEqualTo("图书馆通知");
        assertThat(preview.content()).contains("以官网通知为准");
        assertThat(preview.duplicateDocumentId()).isNull();
    }

    @Test
    void shouldPreviewPdfText() throws Exception {
        byte[] bytes;
        try (PDDocument document = new PDDocument();
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            PDPage page = new PDPage();
            document.addPage(page);
            try (PDPageContentStream content = new PDPageContentStream(document, page)) {
                content.beginText();
                content.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
                content.newLineAtOffset(40, 700);
                content.showText("Library opens at 08:00");
                content.endText();
            }
            document.save(output);
            bytes = output.toByteArray();
        }
        var file = new MockMultipartFile("files", "library.pdf", "application/pdf", bytes);
        assertThat(service.files(1L, new MockMultipartFile[]{file}).get(0).content())
                .contains("Library opens at 08:00");
    }

    @Test
    void shouldRejectInternalAndUntrustedUrlsBeforeFetching() {
        assertThatThrownBy(() -> service.url(1L, "http://localhost/secret"))
                .isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> service.url(1L, "https://127.0.0.1/secret"))
                .isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> service.url(1L, "https://tsguas.edu.cn.evil.test/page"))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void shouldRejectDisguisedFile() {
        var file = new MockMultipartFile("files", "fake.pdf", "application/pdf",
                "not really a PDF".getBytes());
        assertThatThrownBy(() -> service.files(1L, new MockMultipartFile[]{file}))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("格式与扩展名不符");
    }

    @Test
    void shouldExtractAndNormalizeCrawlLinks() {
        byte[] html = """
                <a href="notice/one.html">One</a>
                <a href='../two.html#details'>Two</a>
                <a href="https://www.tsguas.edu.cn/list.html?a=1&amp;b=2">List</a>
                <a href="mailto:test@example.com">Mail</a>
                <a href="javascript:void(0)">Script</a>
                """.getBytes(StandardCharsets.UTF_8);

        assertThat(service.extractLinks(URI.create("https://www.tsguas.edu.cn/news/index.html"), html))
                .containsExactly(
                        URI.create("https://www.tsguas.edu.cn/news/notice/one.html"),
                        URI.create("https://www.tsguas.edu.cn/two.html"),
                        URI.create("https://www.tsguas.edu.cn/list.html?a=1&b=2"));
    }

    @Test
    void shouldUseHtmlMetadataTitleInsteadOfNumericUrlFilename() {
        byte[] html = """
                <!doctype html><html><head><meta charset="utf-8">
                <title>新生户口常见问题及解答</title></head>
                <body><h1>新生户口常见问题及解答</h1><p>迁户自愿，请遵守年度办理时限</p></body></html>
                """.getBytes(StandardCharsets.UTF_8);
        KnowledgeImportPreview preview = ReflectionTestUtils.invokeMethod(service, "parse",
                1L, html, "1720.htm", "https://aqbw.tsguas.edu.cn/info/1008/1720.htm", "URL");
        assertThat(preview.title()).isEqualTo("新生户口常见问题及解答");
        assertThat(preview.content()).contains("迁户自愿");
    }

    @Test
    void shouldUseWordDocumentTitleWhenProvided() throws Exception {
        byte[] bytes;
        try (XWPFDocument document = new XWPFDocument();
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            document.getProperties().getCoreProperties().setTitle("学生服务办理指南");
            document.createParagraph().createRun().setText("按学院审核流程办理");
            document.write(output);
            bytes = output.toByteArray();
        }
        var file = new MockMultipartFile("files", "attachment-1.docx",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document", bytes);
        assertThat(service.files(1L, new MockMultipartFile[]{file}).get(0).title())
                .isEqualTo("学生服务办理指南");
    }

    @Test
    @org.junit.jupiter.api.Timeout(10)
    void responseHeaderGuardsCancelBeforeReading() {
        for (var info : List.of(
                responseInfo(302, "text/html", "100"),
                responseInfo(200, "image/png", "100"),
                responseInfo(200, "application/pdf", "8388609"))) {
            var subscriber = service.responseBodyHandler().apply(info);
            AtomicInteger requested = new AtomicInteger();
            AtomicInteger cancelled = new AtomicInteger();
            subscriber.onSubscribe(new Flow.Subscription() {
                public void request(long n) { requested.incrementAndGet(); }
                public void cancel() { cancelled.incrementAndGet(); }
            });
            assertThatThrownBy(() -> subscriber.getBody().toCompletableFuture()
                    .get(1, TimeUnit.SECONDS)).hasCauseInstanceOf(ResponseStatusException.class);
            assertThat(requested.get()).isZero();
            assertThat(cancelled.get()).isEqualTo(1);
        }
    }

    @Test
    @org.junit.jupiter.api.Timeout(10)
    void allowedBodyWithoutContentLengthRemainsBounded() {
        var subscriber = service.responseBodyHandler().apply(responseInfo(200, "text/html", null));
        AtomicInteger cancelled = new AtomicInteger();
        subscriber.onSubscribe(new Flow.Subscription() {
            public void request(long n) { }
            public void cancel() { cancelled.incrementAndGet(); }
        });
        subscriber.onNext(List.of(ByteBuffer.allocate(8 * 1024 * 1024), ByteBuffer.wrap(new byte[]{1})));
        assertThatThrownBy(() -> subscriber.getBody().toCompletableFuture().get(1, TimeUnit.SECONDS))
                .hasCauseInstanceOf(BoundedKnowledgeBodySubscriber.BodyLimitException.class);
        assertThat(cancelled.get()).isEqualTo(1);
    }

    @Test
    @org.junit.jupiter.api.Timeout(10)
    void scanResponseBodyUsesRemainingBudgetInsteadOfAnotherTwelveSeconds() {
        AtomicLong nanos = new AtomicLong();
        var budget = new KnowledgeCrawlBudget(Duration.ofMillis(200), nanos::get);
        nanos.set(Duration.ofMillis(180).toNanos());
        var subscriber = service.responseBodyHandler(budget).apply(responseInfo(200, "text/html", null));
        AtomicInteger cancelled = new AtomicInteger();
        subscriber.onSubscribe(new Flow.Subscription() {
            public void request(long n) { }
            public void cancel() { cancelled.incrementAndGet(); }
        });
        assertThatThrownBy(() -> subscriber.getBody().toCompletableFuture().get(1, TimeUnit.SECONDS))
                .hasCauseInstanceOf(java.util.concurrent.TimeoutException.class);
        org.awaitility.Awaitility.await().atMost(Duration.ofSeconds(1))
                .untilAsserted(() -> assertThat(cancelled.get()).isEqualTo(1));
    }

    @Test
    @org.junit.jupiter.api.Timeout(10)
    void scanDeadlineBeforeResponseHeadersCancelsWithoutRequestingBody() {
        AtomicLong nanos = new AtomicLong();
        var budget = new KnowledgeCrawlBudget(Duration.ofSeconds(20), nanos::get);
        nanos.set(Duration.ofSeconds(20).toNanos());
        var subscriber = service.responseBodyHandler(budget).apply(responseInfo(200, "text/html", null));
        AtomicInteger requested = new AtomicInteger(), cancelled = new AtomicInteger();
        subscriber.onSubscribe(new Flow.Subscription() {
            public void request(long n) { requested.incrementAndGet(); }
            public void cancel() { cancelled.incrementAndGet(); }
        });
        assertThatThrownBy(() -> subscriber.getBody().toCompletableFuture().get(1, TimeUnit.SECONDS))
                .hasCauseInstanceOf(KnowledgeCrawlBudget.Exhausted.class);
        assertThat(requested.get()).isZero();
        assertThat(cancelled.get()).isEqualTo(1);
    }

    private HttpResponse.ResponseInfo responseInfo(int status, String type, String length) {
        HttpHeaders headers = HttpHeaders.of(length == null ? Map.of("content-type", List.of(type))
                : Map.of("content-type", List.of(type), "content-length", List.of(length)), (k, v) -> true);
        return new HttpResponse.ResponseInfo() {
            public int statusCode() { return status; }
            public HttpHeaders headers() { return headers; }
            public HttpClient.Version version() { return HttpClient.Version.HTTP_1_1; }
        };
    }
}
