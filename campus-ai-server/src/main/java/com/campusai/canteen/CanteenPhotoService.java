package com.campusai.canteen;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageReadParam;
import javax.imageio.ImageReader;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageInputStream;
import javax.imageio.stream.ImageOutputStream;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Iterator;
import java.util.List;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.Set;
import java.util.HexFormat;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Map;
import java.util.LinkedHashMap;

@Service
public class CanteenPhotoService {
    private static final long MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
    private static final long MAX_SOURCE_PIXELS = 24_000_000;
    private static final int MAX_OUTPUT_EDGE = 2400;
    private final JdbcTemplate jdbc;
    private final CanteenService canteens;
    private final Map<String, byte[]> previews = new LinkedHashMap<>();

    public CanteenPhotoService(JdbcTemplate jdbc, CanteenService canteens) {
        this.jdbc = jdbc;
        this.canteens = canteens;
    }

    @Transactional
    public void save(Long schoolId, Long merchantId, MultipartFile file) {
        canteens.requireAdminMerchant(schoolId, merchantId);
        jdbc.queryForObject("SELECT id FROM campus_canteen_merchants WHERE id=? AND school_id=? FOR UPDATE",
                Long.class, merchantId, schoolId);
        if (file == null || file.isEmpty() || file.getSize() > MAX_UPLOAD_BYTES) {
            throw badPhoto("图片须为非空且不超过5MB的JPEG或PNG");
        }
        try {
            byte[] jpeg = normalize(file.getBytes());
            Set<String> contents = new HashSet<>(jdbc.query("SELECT content_sha256 FROM campus_merchant_photo_gallery WHERE merchant_id=? AND school_id=?",
                    (rs,n)->rs.getString(1),merchantId,schoolId));
            contents.add(fingerprint(jpeg));
            if(contents.size()>10)throw badPhoto("更换封面后会超过10张不同照片，请先核对菜单");
            jdbc.update("INSERT INTO campus_merchant_photos (merchant_id, school_id, jpeg_data) "
                    + "VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE jpeg_data = VALUES(jpeg_data)",
                    merchantId, schoolId, jpeg);
        } catch (IOException exception) {
            throw badPhoto("图片无法读取，请更换JPEG或PNG文件");
        }
    }

    public record PublishInput(Long canteenId, String name, String location) {}

    /** One explicit publish action; metadata, sanitized photos and visibility commit together. */
    @Transactional
    public List<CanteenService.Merchant> publish(Long schoolId, List<PublishInput> items,
                                               List<MultipartFile> files) {
        if (items == null || files == null || items.isEmpty() || items.size() > 10 || items.size() != files.size())
            throw badPhoto("每批请提交1至10家商家，每家对应一张照片");
        var available = canteens.adminCanteens(schoolId).stream()
                .filter(c -> "PUBLISHED".equals(c.status())).map(CanteenService.Canteen::id).toList();
        Set<String> names = new HashSet<>();
        List<byte[]> sanitized = new ArrayList<>();
        long bytes = 0;
        for (int i = 0; i < items.size(); i++) {
            var item = items.get(i);
            if (item == null || item.canteenId() == null || !available.contains(item.canteenId()))
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, "请选择本校已发布的食堂");
            if (item.name() == null || item.name().isBlank() || item.name().length() > 120
                    || item.location() == null || item.location().isBlank() || item.location().length() > 120)
                throw badPhoto("请填写商家名称与位置，各不超过120字");
            if (!names.add(item.canteenId() + ":" + item.name().strip().toLowerCase(java.util.Locale.ROOT)))
                throw badPhoto("同一批次不能重复发布同一食堂的同名商家");
            MultipartFile file = files.get(i);
            if (file == null || file.isEmpty() || file.getSize() > MAX_UPLOAD_BYTES)
                throw badPhoto("每张照片须为非空且不超过5MB的JPEG或PNG");
            bytes += file.getSize();
            if (bytes > 30L * 1024 * 1024) throw badPhoto("本批照片总大小不能超过30MB");
            try { sanitized.add(normalize(file.getBytes())); }
            catch (IOException e) { throw badPhoto("照片无法读取，请更换JPEG或PNG文件"); }
        }
        List<CanteenService.Merchant> published = new ArrayList<>();
        for (int i = 0; i < items.size(); i++) {
            var item = items.get(i);
            var merchant = canteens.saveMerchant(schoolId, null, new CanteenService.MerchantInput(
                    item.canteenId(), item.name().strip(), item.location().strip(), ""));
            jdbc.update("INSERT INTO campus_merchant_photos (merchant_id, school_id, jpeg_data) VALUES (?, ?, ?)",
                    merchant.id(), schoolId, sanitized.get(i));
            published.add(canteens.setMerchantPublished(schoolId, merchant.id(), true));
        }
        return List.copyOf(published);
    }

    public byte[] publicPhoto(Long merchantId) {
        return jdbc.query("SELECT photo.jpeg_data FROM campus_merchant_photos photo "
                + "JOIN campus_canteen_merchants merchant ON merchant.id = photo.merchant_id "
                + "AND merchant.school_id = photo.school_id "
                + "JOIN campus_canteens canteen ON canteen.id = merchant.canteen_id "
                + "AND canteen.school_id = merchant.school_id "
                + "WHERE merchant.id = ? AND merchant.status = 'PUBLISHED' "
                + "AND canteen.status = 'PUBLISHED'", result ->
                result.next() ? result.getBytes(1) : null, merchantId);
    }

    public byte[] publicPreview(Long merchantId) {
        // Visibility is always rechecked before consulting the small derived-image cache.
        byte[] data=publicPhoto(merchantId);
        if(data==null)return null;
        String key=merchantId+":"+fingerprint(data);
        synchronized(previews){if(previews.containsKey(key))return previews.get(key);}
        try {
            byte[] preview=normalize(data,720,0.78f);
            synchronized(previews){previews.put(key,preview);while(previews.size()>64)previews.remove(previews.keySet().iterator().next());}
            return preview;
        } catch(IOException e){return data;}
    }

    public record Photo(Long id) {}

    /** Additional menus belong to the same merchant, not another rating target. */
    @Transactional
    public List<Photo> append(Long schoolId, Long merchantId, List<MultipartFile> files) {
        canteens.requireAdminMerchant(schoolId, merchantId);
        jdbc.queryForObject("SELECT id FROM campus_canteen_merchants WHERE id=? AND school_id=? FOR UPDATE",
                Long.class, merchantId, schoolId);
        if (files == null || files.isEmpty() || files.size() > 10)
            throw badPhoto("每次可添加1至10张照片");
        List<byte[]> sanitized = new ArrayList<>();
        long total = 0;
        for (var file : files) {
            if (file == null || file.isEmpty() || file.getSize() > MAX_UPLOAD_BYTES)
                throw badPhoto("每张照片须为5MB以内的JPEG或PNG");
            total += file.getSize();
            if (total > 30L * 1024 * 1024) throw badPhoto("本批照片总大小不能超过30MB");
            try { sanitized.add(normalize(file.getBytes())); }
            catch (IOException e) { throw badPhoto("照片无法读取，本批未添加"); }
        }
        var existing = jdbc.query("SELECT jpeg_data FROM campus_merchant_photos WHERE merchant_id=? AND school_id=?",
                (rs, n) -> rs.getBytes(1), merchantId, schoolId);
        Set<String> fingerprints = new HashSet<>();
        existing.forEach(data -> fingerprints.add(fingerprint(data)));
        fingerprints.addAll(jdbc.query("SELECT content_sha256 FROM campus_merchant_photo_gallery WHERE merchant_id=? AND school_id=?",
                (rs, n) -> rs.getString(1), merchantId, schoolId));
        List<byte[]> fresh = new ArrayList<>();
        for (var data : sanitized) if (fingerprints.add(fingerprint(data))) fresh.add(data);
        if (fingerprints.size() > 10) throw badPhoto("每家商家最多保留10张不同照片");
        boolean hasCover = !existing.isEmpty();
        for (var data : fresh) {
            if (!hasCover) {
                jdbc.update("INSERT INTO campus_merchant_photos(merchant_id,school_id,jpeg_data) VALUES(?,?,?)",
                        merchantId, schoolId, data);
                hasCover = true;
            } else jdbc.update("INSERT INTO campus_merchant_photo_gallery(merchant_id,school_id,jpeg_data,content_sha256) VALUES(?,?,?,?)",
                    merchantId, schoolId, data, fingerprint(data));
        }
        return photoList(schoolId, merchantId, false);
    }

    public List<Photo> photoList(Long schoolId, Long merchantId, boolean publishedOnly) {
        if (publishedOnly) {
            Long found = jdbc.queryForObject("SELECT COUNT(*) FROM campus_canteen_merchants m JOIN campus_canteens c "
                    + "ON c.id=m.canteen_id AND c.school_id=m.school_id WHERE m.id=? AND m.school_id=? "
                    + "AND m.status='PUBLISHED' AND c.status='PUBLISHED'", Long.class, merchantId, schoolId);
            if (found == null || found != 1) throw new ResponseStatusException(HttpStatus.NOT_FOUND,"商家不存在或尚未发布");
        } else canteens.requireAdminMerchant(schoolId, merchantId);
        List<Photo> result = new ArrayList<>();
        var cover = jdbc.query("SELECT jpeg_data FROM campus_merchant_photos WHERE merchant_id=? AND school_id=?",
                (rs, n) -> fingerprint(rs.getBytes(1)), merchantId, schoolId);
        if (!cover.isEmpty()) result.add(new Photo(0L));
        jdbc.query("SELECT id,content_sha256 FROM campus_merchant_photo_gallery WHERE merchant_id=? AND school_id=? ORDER BY id",
                (org.springframework.jdbc.core.RowCallbackHandler) rs -> {
                    if (!cover.contains(rs.getString(2))) result.add(new Photo(rs.getLong(1)));
                }, merchantId, schoolId);
        return List.copyOf(result);
    }

    public byte[] publicGalleryPhoto(Long merchantId, Long photoId) {
        return jdbc.query("SELECT p.jpeg_data FROM campus_merchant_photo_gallery p JOIN campus_canteen_merchants m "
                + "ON m.id=p.merchant_id AND m.school_id=p.school_id JOIN campus_canteens c ON c.id=m.canteen_id "
                + "AND c.school_id=m.school_id WHERE p.id=? AND m.id=? AND m.status='PUBLISHED' AND c.status='PUBLISHED'",
                rs -> rs.next() ? rs.getBytes(1) : null, photoId, merchantId);
    }

    public static String contentTag(byte[] data) { return fingerprint(data); }

    private static String fingerprint(byte[] data) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(data)); }
        catch (NoSuchAlgorithmException e) { throw new IllegalStateException("SHA-256 unavailable"); }
    }

    static byte[] normalize(byte[] data) throws IOException {
        return normalize(data, MAX_OUTPUT_EDGE, 0.86f);
    }

    private static byte[] normalize(byte[] data,int edge,float quality) throws IOException {
        if (data.length == 0 || data.length > MAX_UPLOAD_BYTES) throw badPhoto("图片大小不符合要求");
        try (ImageInputStream input = ImageIO.createImageInputStream(new ByteArrayInputStream(data))) {
            if (input == null) throw badPhoto("图片格式无法识别");
            Iterator<ImageReader> readers = ImageIO.getImageReaders(input);
            if (!readers.hasNext()) throw badPhoto("仅支持JPEG或PNG图片");
            ImageReader reader = readers.next();
            try {
                reader.setInput(input, true, true);
                String format = reader.getFormatName();
                if (!"JPEG".equalsIgnoreCase(format) && !"PNG".equalsIgnoreCase(format)) {
                    throw badPhoto("仅支持JPEG或PNG图片");
                }
                int width = reader.getWidth(0);
                int height = reader.getHeight(0);
                if (width <= 0 || height <= 0 || (long) width * height > MAX_SOURCE_PIXELS) {
                    throw badPhoto("图片像素过大，请压缩后再上传");
                }
                ImageReadParam params = reader.getDefaultReadParam();
                BufferedImage source = reader.read(0, params);
                double scale = Math.min(1, (double) edge / Math.max(width, height));
                int outputWidth = Math.max(1, (int) Math.round(width * scale));
                int outputHeight = Math.max(1, (int) Math.round(height * scale));
                BufferedImage output = new BufferedImage(outputWidth, outputHeight, BufferedImage.TYPE_INT_RGB);
                Graphics2D graphics = output.createGraphics();
                try {
                    graphics.setColor(Color.WHITE);
                    graphics.fillRect(0, 0, outputWidth, outputHeight);
                    graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION,
                            RenderingHints.VALUE_INTERPOLATION_BICUBIC);
                    graphics.drawImage(source, 0, 0, outputWidth, outputHeight, null);
                } finally {
                    graphics.dispose();
                }
                ByteArrayOutputStream bytes = new ByteArrayOutputStream();
                Iterator<ImageWriter> writers = ImageIO.getImageWritersByFormatName("jpeg");
                if (!writers.hasNext()) throw new IOException("JPEG编码器不可用");
                ImageWriter writer = writers.next();
                try (ImageOutputStream imageOutput = ImageIO.createImageOutputStream(bytes)) {
                    writer.setOutput(imageOutput);
                    ImageWriteParam writeParams = writer.getDefaultWriteParam();
                    writeParams.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
                    writeParams.setCompressionQuality(quality);
                    writer.write(null, new IIOImage(output, null, null), writeParams);
                } finally {
                    writer.dispose();
                }
                return bytes.toByteArray();
            } finally {
                reader.dispose();
            }
        }
    }

    private static ResponseStatusException badPhoto(String reason) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, reason);
    }
}
