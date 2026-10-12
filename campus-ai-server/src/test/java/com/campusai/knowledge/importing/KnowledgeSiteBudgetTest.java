package com.campusai.knowledge.importing;

import com.campusai.mapper.KnowledgeDocumentMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@Timeout(10)
class KnowledgeSiteBudgetTest {
    private static final String SEED = "https://www.tsguas.edu.cn/info/index.htm";
    private final AtomicLong nanos = new AtomicLong();
    private final KnowledgeDocumentMapper documents = mock(KnowledgeDocumentMapper.class);
    private final List<URI> attempted = new ArrayList<>();

    @Test
    void budgetNeverResetsAndHandlesNanoTimeWraparound() {
        nanos.set(Long.MAX_VALUE - 10);
        var budget = new KnowledgeCrawlBudget(Duration.ofNanos(20), nanos::get);
        assertThat(budget.remaining(Duration.ofNanos(12))).isEqualTo(Duration.ofNanos(12));
        nanos.addAndGet(15);
        assertThat(budget.remaining(Duration.ofNanos(12))).isEqualTo(Duration.ofNanos(5));
        nanos.addAndGet(5);
        assertThatThrownBy(budget::check).isInstanceOf(KnowledgeCrawlBudget.Exhausted.class);
        assertThatThrownBy(() -> new KnowledgeCrawlBudget(Duration.ZERO)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void completedPageSurvivesButNextLinkCannotRenewExhaustedBudget() {
        var service = service(uri -> {
            if (uri.toString().equals(SEED)) {
                nanos.addAndGet(Duration.ofSeconds(8).toNanos());
                return html("<a href='one.htm'>one</a><a href='two.htm'>two</a>");
            }
            nanos.addAndGet(Duration.ofSeconds(13).toNanos());
            throw new KnowledgeCrawlBudget.Exhausted();
        });
        var result = service.site(1L, SEED, 20, 3, true, budget());
        assertThat(result.pages()).hasSize(1);
        assertThat(result.visitedCount()).isEqualTo(2);
        assertThat(result.skippedCount()).isEqualTo(1);
        assertThat(attempted).hasSize(2);
        assertThat(result.warnings()).containsExactly("已达到本批扫描时间预算，保留已解析页面，其余链接未解析；请分批扫描");
    }

    @Test
    void fetchedPageAfterDeadlineIsNotParsedOrReturnedAsComplete() {
        var service = service(uri -> {
            nanos.addAndGet(Duration.ofSeconds(21).toNanos());
            return html("late");
        });
        assertThatThrownBy(() -> service.site(1L, SEED, 20, 3, true, budget()))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("尚未取得可解析页面");
        verifyNoInteractions(documents);
        assertThat(attempted).hasSize(1);
    }

    @Test
    void parseOverrunKeepsCompletedPreviewWithoutStartingAnotherLink() {
        when(documents.findPotentialConflicts(any(), anyString(), anyString())).thenAnswer(invocation -> {
            nanos.addAndGet(Duration.ofSeconds(21).toNanos());
            return List.of();
        });
        var service = service(uri -> html("<a href='one.htm'>one</a>"));
        var result = service.site(1L, SEED, 20, 3, true, budget());
        assertThat(result.pages()).hasSize(1);
        assertThat(result.skippedCount()).isZero();
        assertThat(attempted).hasSize(1);
        assertThat(result.warnings()).anyMatch(warning -> warning.contains("时间预算"));
    }

    @Test
    void failedLastLinkStillReportsBudgetRatherThanGenericConnectionError() {
        var service = service(uri -> {
            nanos.addAndGet(Duration.ofSeconds(21).toNanos());
            throw new IOException("upstream detail must not leak");
        });
        assertThatThrownBy(() -> service.site(1L, SEED, 20, 3, true, budget()))
                .hasMessageContaining("时间预算已用尽")
                .hasMessageNotContaining("upstream detail");
    }

    @Test
    void visitedPageLimitAndHostPathDepthRestrictionsRemainInForce() {
        var service = service(uri -> html("""
                <a href='one.htm'>one</a><a href='one.htm#duplicate'>duplicate</a>
                <a href='/elsewhere.htm'>path</a><a href='https://other.tsguas.edu.cn/info/one.htm'>host</a>
                <a href='one.htm?download=1'>query</a><a href='http://www.tsguas.edu.cn/info/one.htm'>http</a>
                """));
        var result = service.site(1L, SEED, 1, 3, true, budget());
        assertThat(result.pages()).hasSize(1);
        assertThat(result.visitedCount()).isEqualTo(1);
        assertThat(result.skippedCount()).isEqualTo(4);
        assertThat(result.warnings()).containsExactly("已达到 1 页上限，其余链接未解析");
        attempted.clear();
        result = service.site(1L, SEED, 20, 0, true, budget());
        assertThat(result.pages()).hasSize(1);
        assertThat(attempted).hasSize(1);
        assertThat(result.warnings()).isEmpty();
    }

    @Test
    void accessAttemptLimitReturnsPartialPreviewAndExplicitWarning() {
        var service = service(uri -> {
            if (uri.toString().equals(SEED)) {
                StringBuilder links = new StringBuilder();
                for (int i = 0; i < 15; i++) links.append("<a href='").append(i).append(".htm'>next</a>");
                return html(links.toString());
            }
            throw new IOException("unavailable");
        });
        var result = service.site(1L, SEED, 2, 3, true, budget());
        assertThat(result.pages()).hasSize(1);
        assertThat(result.visitedCount()).isEqualTo(10);
        assertThat(attempted).hasSize(10);
        assertThat(result.warnings()).anyMatch(warning -> warning.equals("已达到 10 次链接访问上限，其余链接未解析"));
    }

    @Test
    void preexistingInterruptStopsBeforeFetchingAndPreservesInterrupt() {
        var service = service(uri -> html("unused"));
        Thread.currentThread().interrupt();
        try {
            assertThatThrownBy(() -> service.site(1L, SEED, 20, 3, true, budget()))
                    .hasMessageContaining("已中断");
            assertThat(Thread.currentThread().isInterrupted()).isTrue();
            assertThat(attempted).isEmpty();
        } finally {
            Thread.interrupted();
        }
    }

    private KnowledgeCrawlBudget budget() {
        return new KnowledgeCrawlBudget(Duration.ofSeconds(20), nanos::get);
    }

    private KnowledgeImportPreviewService service(PageLoader loader) {
        return new KnowledgeImportPreviewService(documents, "tsguas.edu.cn") {
            @Override FetchedPage fetch(URI uri, KnowledgeCrawlBudget budget) throws IOException {
                attempted.add(uri);
                return loader.load(uri);
            }
        };
    }

    private KnowledgeImportPreviewService.FetchedPage html(String body) {
        return new KnowledgeImportPreviewService.FetchedPage(("<html><head><meta charset='utf-8'>"
                + "<title>Official test</title></head><body><p>Campus service test</p>"
                + body + "</body></html>").getBytes(StandardCharsets.UTF_8), "text/html");
    }

    @FunctionalInterface
    private interface PageLoader {
        KnowledgeImportPreviewService.FetchedPage load(URI uri) throws IOException;
    }
}
