package com.campusai.knowledge.importing;

import com.campusai.dto.KnowledgeImportPreview;
import com.campusai.dto.KnowledgeSitePreviewResponse;
import com.campusai.knowledge.entity.KnowledgeDocument;
import com.campusai.mapper.KnowledgeDocumentMapper;
import org.apache.tika.Tika;
import org.apache.tika.metadata.Metadata;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.net.InetAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class KnowledgeImportPreviewService {
    private static final int MAX_BYTES = 8 * 1024 * 1024;
    private static final int MAX_CHARS = 100_000;
    private static final int MAX_LINKS_PER_PAGE = 500;
    private static final int MAX_CRAWL_ATTEMPTS_MULTIPLIER = 5;
    private static final Duration SITE_SCAN_BUDGET = Duration.ofSeconds(20);
    private static final Duration PAGE_FETCH_BUDGET = Duration.ofSeconds(12);
    private static final Pattern LINK_PATTERN = Pattern.compile(
            "(?is)<a\\b[^>]*?\\bhref\\s*=\\s*([\\\"'])(.*?)\\1");
    private final KnowledgeDocumentMapper documents;
    private final List<String> allowedHosts;
    private final Tika tika = new Tika();
    private final HttpClient http = HttpClient.newBuilder()
            .followRedirects(HttpClient.Redirect.NEVER)
            .connectTimeout(Duration.ofSeconds(5)).build();

    public KnowledgeImportPreviewService(KnowledgeDocumentMapper documents,
            @Value("${app.knowledge.import-allowed-hosts:tsguas.edu.cn}") String hosts) {
        this.documents = documents;
        this.allowedHosts = Arrays.stream(hosts.split(","))
                .map(value -> value.trim().toLowerCase(Locale.ROOT))
                .filter(value -> !value.isBlank()).toList();
    }

    public List<KnowledgeImportPreview> files(Long schoolId, MultipartFile[] files) {
        if (files == null || files.length == 0 || files.length > 20) {
            throw badRequest("每次请选择1至20个PDF或Word文件");
        }
        List<KnowledgeImportPreview> previews = new ArrayList<>();
        for (MultipartFile file : files) {
            String name = file.getOriginalFilename() == null ? "" : file.getOriginalFilename();
            String lower = name.toLowerCase(Locale.ROOT);
            if (!(lower.endsWith(".pdf") || lower.endsWith(".docx") || lower.endsWith(".doc"))) {
                throw badRequest("仅支持PDF、DOCX或DOC文件：" + name);
            }
            if (file.isEmpty() || file.getSize() > MAX_BYTES) {
                throw badRequest("文件为空或超过8MB：" + name);
            }
            try {
                byte[] data = file.getBytes();
                String detected = tika.detect(data);
                if (!validFileType(lower, detected)) throw badRequest("文件格式与扩展名不符：" + name);
                previews.add(parse(schoolId, data, name, null, "FILE"));
            } catch (IOException exception) {
                throw badRequest("读取文件失败：" + name);
            }
        }
        return previews;
    }

    public KnowledgeImportPreview url(Long schoolId, String rawUrl) {
        URI uri = safeUri(rawUrl);
        try {
            FetchedPage page = fetch(uri);
            return parse(schoolId, page.data(), filename(uri),
                    uri.toString(), "URL");
        } catch (ResponseStatusException exception) {
            throw exception;
        } catch (IOException exception) {
            throw badRequest("网页读取失败，请检查链接或改用文件上传");
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw badRequest("网页读取已中断");
        }
    }

    public KnowledgeSitePreviewResponse site(Long schoolId, String rawUrl, int maxPages,
                                               int maxDepth, boolean restrictToPath) {
        return site(schoolId, rawUrl, maxPages, maxDepth, restrictToPath,
                new KnowledgeCrawlBudget(SITE_SCAN_BUDGET));
    }

    KnowledgeSitePreviewResponse site(Long schoolId, String rawUrl, int maxPages,
                                       int maxDepth, boolean restrictToPath, KnowledgeCrawlBudget budget) {
        if (maxPages < 1 || maxPages > 20 || maxDepth < 0 || maxDepth > 3) {
            throw badRequest("整站解析最多20页、3层");
        }
        URI seed = normalize(safeUri(rawUrl));
        String pathPrefix = restrictToPath ? crawlPathPrefix(seed.getPath()) : "/";
        Deque<CrawlTarget> queue = new ArrayDeque<>();
        Set<String> scheduled = new HashSet<>();
        List<KnowledgeImportPreview> pages = new ArrayList<>();
        List<String> warnings = new ArrayList<>();
        int skipped = 0;
        int attempted = 0;
        String firstFailure = null;
        boolean budgetExhausted = false;
        int attemptLimit = Math.max(maxPages, maxPages * MAX_CRAWL_ATTEMPTS_MULTIPLIER);
        queue.add(new CrawlTarget(seed, 0));
        scheduled.add(seed.toString());

        while (!queue.isEmpty() && pages.size() < maxPages && attempted < attemptLimit) {
            if (Thread.currentThread().isInterrupted()) throw badRequest("整站解析已中断");
            try {
                budget.check();
            } catch (KnowledgeCrawlBudget.Exhausted exhausted) {
                budgetExhausted = true;
                break;
            }
            CrawlTarget target = queue.removeFirst();
            attempted++;
            boolean parsed = false;
            try {
                FetchedPage page = fetch(target.uri(), budget);
                budget.check();
                pages.add(parse(schoolId, page.data(), filename(target.uri()),
                        target.uri().toString(), "SITE"));
                parsed = true;
                budget.check();
                if (target.depth() >= maxDepth || !page.contentType().startsWith("text/html")) {
                    continue;
                }
                for (URI link : extractLinks(target.uri(), page.data())) {
                    if (!isCrawlCandidate(seed, link, pathPrefix)) {
                        skipped++;
                        continue;
                    }
                    String key = link.toString();
                    if (scheduled.add(key)) queue.addLast(new CrawlTarget(link, target.depth() + 1));
                }
            } catch (KnowledgeCrawlBudget.Exhausted exhausted) {
                // Keep completed previews, but never start another link with a fresh budget.
                budgetExhausted = true;
                if (!parsed) skipped++;
                break;
            } catch (ResponseStatusException exception) {
                skipped++;
                if (firstFailure == null) firstFailure = exception.getReason();
                if (warnings.size() < 10) {
                    warnings.add(target.uri() + "：" + exception.getReason());
                }
            } catch (IOException exception) {
                skipped++;
                if (firstFailure == null) firstFailure = "读取失败或连接超时";
                if (warnings.size() < 10) warnings.add(target.uri() + "：读取失败");
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                throw badRequest("整站解析已中断");
            }
        }
        if (!budgetExhausted && (pages.isEmpty() || !queue.isEmpty())) {
            try {
                budget.check();
            } catch (KnowledgeCrawlBudget.Exhausted exhausted) {
                budgetExhausted = true;
            }
        }
        if (pages.isEmpty()) {
            if (budgetExhausted) {
                throw badRequest("本批扫描时间预算已用尽，尚未取得可解析页面；请缩小范围或改用单页链接");
            }
            throw badRequest("入口网页无法解析：" + (firstFailure == null ? "请检查地址和栏目范围" : firstFailure));
        }
        if (budgetExhausted) {
            warnings.add("已达到本批扫描时间预算，保留已解析页面，其余链接未解析；请分批扫描");
        } else if (!queue.isEmpty() && pages.size() >= maxPages) {
            warnings.add("已达到 " + maxPages + " 页上限，其余链接未解析");
        } else if (!queue.isEmpty() && attempted >= attemptLimit) {
            warnings.add("已达到 " + attemptLimit + " 次链接访问上限，其余链接未解析");
        }
        return new KnowledgeSitePreviewResponse(List.copyOf(pages), attempted, skipped,
                List.copyOf(warnings));
    }

    private FetchedPage fetch(URI uri) throws IOException, InterruptedException {
        return fetch(uri, null);
    }

    FetchedPage fetch(URI uri, KnowledgeCrawlBudget budget) throws IOException, InterruptedException {
        if (budget != null) budget.check();
        assertPublicAddress(uri);
        HttpRequest request = HttpRequest.newBuilder(uri)
                .timeout(budget == null ? PAGE_FETCH_BUDGET : budget.remaining(PAGE_FETCH_BUDGET))
                .header("User-Agent", "CampusAI-KnowledgeImporter/1.0")
                .GET().build();
        HttpResponse<byte[]> response;
        try {
            response = http.send(request, responseBodyHandler(budget));
        } catch (IOException exception) {
            // HttpClient wraps subscriber failures; expose only our known safe reasons.
            Throwable cause = exception;
            for (int depth = 0; cause != null && depth < 8; depth++, cause = cause.getCause()) {
                if (cause instanceof ResponseStatusException rejected) throw rejected;
                if (cause instanceof KnowledgeCrawlBudget.Exhausted exhausted) throw exhausted;
                if (cause instanceof BoundedKnowledgeBodySubscriber.BodyLimitException) {
                    throw badRequest("网页超过8MB");
                }
                if (cause instanceof java.util.concurrent.TimeoutException) {
                    if (budget != null) budget.check();
                    throw badRequest("网页正文读取超时，请稍后重试或改用文件上传");
                }
            }
            throw exception;
        }
        String type = response.headers().firstValue("content-type").orElse("")
                .toLowerCase(Locale.ROOT);
        byte[] data = response.body();
        if (data.length == 0) throw badRequest("网页内容为空");
        String detected = tika.detect(data);
        if (type.startsWith("application/pdf") && !"application/pdf".equals(detected)) {
            throw badRequest("链接返回内容不是PDF");
        }
        return new FetchedPage(data, type);
    }

    HttpResponse.BodyHandler<byte[]> responseBodyHandler() {
        return responseBodyHandler(null);
    }

    HttpResponse.BodyHandler<byte[]> responseBodyHandler(KnowledgeCrawlBudget budget) {
        return info -> {
            Throwable failure = null;
            Duration timeout = PAGE_FETCH_BUDGET;
            if (budget != null) {
                try {
                    timeout = budget.remaining(PAGE_FETCH_BUDGET);
                } catch (KnowledgeCrawlBudget.Exhausted exhausted) {
                    failure = exhausted;
                }
            }
            String type = info.headers().firstValue("content-type").orElse("")
                    .toLowerCase(Locale.ROOT);
            if (failure != null) {
                // An exhausted scan must cancel before requesting any response bytes.
            } else if (info.statusCode() != 200) {
                failure = badRequest("网页返回状态 " + info.statusCode()
                        + "；跳转链接请提交最终地址");
            } else if (!(type.startsWith("text/html") || type.startsWith("application/pdf"))) {
                failure = badRequest("链接只支持HTML网页或PDF");
            } else if (info.headers().firstValueAsLong("content-length").orElse(0) > MAX_BYTES) {
                failure = badRequest("网页超过8MB");
            }
            return new BoundedKnowledgeBodySubscriber(MAX_BYTES, timeout, failure);
        };
    }

    private void assertPublicAddress(URI uri) throws IOException {
        for (InetAddress address : InetAddress.getAllByName(uri.getHost())) {
            if (address.isAnyLocalAddress() || address.isLoopbackAddress()
                    || address.isLinkLocalAddress() || address.isSiteLocalAddress()
                    || address.isMulticastAddress() || isUniqueLocalIpv6(address)) {
                throw badRequest("不允许访问内网地址");
            }
        }
    }

    List<URI> extractLinks(URI base, byte[] html) {
        String source = new String(html, StandardCharsets.UTF_8);
        Matcher matcher = LINK_PATTERN.matcher(source);
        List<URI> links = new ArrayList<>();
        while (matcher.find()) {
            String raw = decodeHtmlAttribute(matcher.group(2).trim());
            if (raw.isBlank() || raw.startsWith("#") || raw.startsWith("mailto:")
                    || raw.startsWith("tel:") || raw.startsWith("javascript:")) continue;
            try {
                links.add(normalize(base.resolve(raw)));
                if (links.size() >= MAX_LINKS_PER_PAGE) break;
            } catch (IllegalArgumentException ignored) {
                // A malformed link on one page must not abort the whole crawl preview.
            }
        }
        return links;
    }

    private boolean isCrawlCandidate(URI seed, URI candidate, String pathPrefix) {
        String path = candidate.getPath() == null || candidate.getPath().isBlank()
                ? "/" : candidate.getPath();
        return "https".equalsIgnoreCase(candidate.getScheme())
                && candidate.getUserInfo() == null && candidate.getPort() == -1
                && seed.getHost().equalsIgnoreCase(candidate.getHost())
                && path.startsWith(pathPrefix)
                && candidate.getQuery() == null;
    }

    private URI normalize(URI uri) {
        try {
            String path = uri.getPath() == null || uri.getPath().isBlank() ? "/" : uri.getPath();
            return new URI(uri.getScheme(), null, uri.getHost(), -1, path, uri.getQuery(), null)
                    .normalize();
        } catch (Exception exception) {
            throw badRequest("链接格式无效");
        }
    }

    private String crawlPathPrefix(String path) {
        if (path == null || path.isBlank() || "/".equals(path)) return "/";
        if (path.endsWith("/")) return path;
        int slash = path.lastIndexOf('/');
        return slash < 0 ? "/" : path.substring(0, slash + 1);
    }

    private String filename(URI uri) {
        String path = uri.getPath();
        if (path == null || path.isBlank() || path.endsWith("/")) return uri.getHost();
        String name = path.substring(path.lastIndexOf('/') + 1);
        return name.isBlank() ? uri.getHost() : name;
    }

    private String decodeHtmlAttribute(String value) {
        return value.replace("&amp;", "&").replace("&#38;", "&")
                .replace("&quot;", "\"").replace("&#39;", "'");
    }

    private KnowledgeImportPreview parse(Long schoolId, byte[] data, String filename,
                                         String sourceUrl, String sourceType) {
        Metadata metadata = new Metadata();
        metadata.set("resourceName", filename);
        try {
            List<String> warnings = List.of();
            String content;
            String detectedType = tika.detect(data);
            if ("text/html".equals(detectedType) || "application/xhtml+xml".equals(detectedType)) {
                var body = OfficialHtmlContent.extract(data, sourceUrl);
                content = body.content();
                metadata.set(org.apache.tika.metadata.TikaCoreProperties.TITLE, body.title());
                warnings = body.warnings();
            } else {
                content = tika.parseToString(new ByteArrayInputStream(data), metadata, MAX_CHARS + 1);
            }
            content = content.replace("\r\n", "\n").replace('\r', '\n').trim();
            if (content.isBlank()) throw badRequest("未解析出文字；扫描版PDF请先做OCR");
            if (content.length() > MAX_CHARS) throw badRequest("正文超过10万字，请拆分后导入");
            String title = metadata.get(org.apache.tika.metadata.TikaCoreProperties.TITLE);
            if (title == null || title.isBlank()) title = metadata.get("title");
            if (title == null || title.isBlank()) title = filename.replaceFirst("(?i)\\.(pdf|docx?|html?)$", "");
            title = title.strip();
            if (title.isBlank()) title = "待命名资料";
            title = title.substring(0, Math.min(200, title.length()));
            KnowledgeDocument duplicate = documents.findBySchoolIdAndContentHash(schoolId, sha256(content));
            List<KnowledgeDocument> conflicts = documents.findPotentialConflicts(
                    schoolId, title, sourceUrl);
            return new KnowledgeImportPreview(title, content, sourceUrl, sourceType,
                    duplicate == null ? null : duplicate.getId(),
                    conflicts == null ? List.of() : conflicts.stream()
                            .map(KnowledgeDocument::getId)
                            .filter(id -> duplicate == null || !id.equals(duplicate.getId()))
                            .toList(), warnings);
        } catch (ResponseStatusException exception) {
            throw exception;
        } catch (Exception exception) {
            throw badRequest("解析失败，文件可能损坏或受密码保护");
        }
    }

    private URI safeUri(String raw) {
        try {
            URI uri = URI.create(raw == null ? "" : raw.trim());
            String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase(Locale.ROOT);
            if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getUserInfo() != null
                    || uri.getPort() != -1 || host.isBlank() || uri.getFragment() != null
                    || allowedHosts.stream().noneMatch(item -> host.equals(item) || host.endsWith("." + item))) {
                throw badRequest("仅允许已配置的学校官网HTTPS链接");
            }
            return uri;
        } catch (IllegalArgumentException exception) {
            throw badRequest("链接格式无效");
        }
    }

    private boolean validFileType(String name, String detected) {
        return name.endsWith(".pdf") && "application/pdf".equals(detected)
                || name.endsWith(".docx") && detected.contains("wordprocessingml")
                || name.endsWith(".doc") && ("application/msword".equals(detected)
                        || "application/x-tika-msoffice".equals(detected));
    }

    private boolean isUniqueLocalIpv6(InetAddress address) {
        byte[] raw = address.getAddress();
        return raw.length == 16 && (raw[0] & 0xfe) == 0xfc;
    }

    private String sha256(String content) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(content.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException(exception);
        }
    }

    private ResponseStatusException badRequest(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }

    private record CrawlTarget(URI uri, int depth) {}
    record FetchedPage(byte[] data, String contentType) {}
}
