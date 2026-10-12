package com.campusai.canteen;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
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

@Service
public class CanteenPhotoService {
    private static final long MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
    private static final long MAX_SOURCE_PIXELS = 24_000_000;
    private static final int MAX_OUTPUT_EDGE = 1280;
    private final JdbcTemplate jdbc;
    private final CanteenService canteens;

    public CanteenPhotoService(JdbcTemplate jdbc, CanteenService canteens) {
        this.jdbc = jdbc;
        this.canteens = canteens;
    }

    public void save(Long schoolId, Long merchantId, MultipartFile file) {
        canteens.requireAdminMerchant(schoolId, merchantId);
        if (file == null || file.isEmpty() || file.getSize() > MAX_UPLOAD_BYTES) {
            throw badPhoto("图片须为非空且不超过5MB的JPEG或PNG");
        }
        try {
            byte[] jpeg = normalize(file.getBytes());
            jdbc.update("INSERT INTO campus_merchant_photos (merchant_id, school_id, jpeg_data) "
                    + "VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE jpeg_data = VALUES(jpeg_data)",
                    merchantId, schoolId, jpeg);
        } catch (IOException exception) {
            throw badPhoto("图片无法读取，请更换JPEG或PNG文件");
        }
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

    static byte[] normalize(byte[] data) throws IOException {
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
                double scale = Math.min(1, (double) MAX_OUTPUT_EDGE / Math.max(width, height));
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
                    writeParams.setCompressionQuality(0.78f);
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
