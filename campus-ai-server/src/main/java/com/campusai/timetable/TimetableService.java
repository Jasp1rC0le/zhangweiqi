package com.campusai.timetable;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import javax.imageio.ImageIO;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.security.MessageDigest;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.LocalDate;
import java.util.HexFormat;

/** Private screenshots only. Never sends a timetable to an AI or school service. */
@Service
public class TimetableService {
    public static final int MAX_IMAGE_BYTES = 2 * 1024 * 1024;
    private final JdbcTemplate jdbc;
    public TimetableService(JdbcTemplate jdbc) { this.jdbc = jdbc; }
    public record Input(int revision, String semester, LocalDate firstMonday, int startWeek, int endWeek, int remindDays) {}
    public record Snapshot(int revision, String semester, LocalDate firstMonday, int startWeek, int endWeek,
                           int remindDays, String imageSha256, Instant importedAt, Instant checkedAt) {}
    public record State(Snapshot timetable) {}
    public record Image(byte[] bytes, String mime) {}
    record SafeImage(byte[] bytes, String mime, String sha256) {}

    public State get(Long userId) {
        var rows = jdbc.query("SELECT revision,semester,first_monday,start_week,end_week,remind_days,image_sha256,imported_at,checked_at "
                + "FROM student_timetables WHERE user_id = ?", (rs, n) -> snapshot(rs), userId);
        return new State(rows.isEmpty() ? null : rows.get(0));
    }
    public Image image(Long userId, int revision) {
        var rows = jdbc.query("SELECT image_bytes,image_mime FROM student_timetables WHERE user_id = ? AND revision = ?",
                (rs, n) -> new Image(rs.getBytes("image_bytes"), rs.getString("image_mime")), userId, revision);
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "课表已更换或不存在，请重新读取");
        return rows.get(0);
    }
    @Transactional
    public State save(Long userId, Input input, byte[] rawImage) {
        validate(input);
        SafeImage image = sanitize(rawImage);
        // Per-owner serialization also prevents concurrent first imports from overwriting.
        jdbc.queryForObject("SELECT id FROM users WHERE id = ? FOR UPDATE", Long.class, userId);
        Snapshot previous = get(userId).timetable();
        if (input.revision() != (previous == null ? 0 : previous.revision())) throw conflict();
        String semester = input.semester().trim();
        boolean identical = previous != null && previous.imageSha256().equals(image.sha256())
                && previous.semester().equals(semester) && previous.firstMonday().equals(input.firstMonday())
                && previous.startWeek() == input.startWeek() && previous.endWeek() == input.endWeek()
                && previous.remindDays() == input.remindDays();
        if (identical) {
            jdbc.update("UPDATE student_timetables SET checked_at=CURRENT_TIMESTAMP WHERE user_id = ? AND revision = ?",
                    userId, previous.revision());
        } else if (previous == null) {
            int revision = nextRevision(userId, 0);
            jdbc.update("INSERT INTO student_timetables(user_id,revision,semester,first_monday,start_week,end_week,remind_days,image_bytes,image_mime,image_sha256) "
                    + "VALUES(?,?,?,?,?,?,?,?,?,?)", userId, revision, semester, input.firstMonday(), input.startWeek(), input.endWeek(),
                    input.remindDays(), image.bytes(), image.mime(), image.sha256());
        } else {
            int revision = nextRevision(userId, previous.revision());
            int changed = jdbc.update("UPDATE student_timetables SET revision=?,semester=?,first_monday=?,start_week=?,end_week=?,remind_days=?,"
                    + "image_bytes=?,image_mime=?,image_sha256=?,imported_at=CURRENT_TIMESTAMP,checked_at=CURRENT_TIMESTAMP WHERE user_id = ? AND revision = ?",
                    revision, semester, input.firstMonday(), input.startWeek(), input.endWeek(), input.remindDays(), image.bytes(), image.mime(), image.sha256(), userId, input.revision());
            if (changed != 1) throw conflict();
        }
        return get(userId);
    }
    private int nextRevision(Long userId, int previous) {
        // Keep only a counter after image deletion: an old tab must not match a recreated revision (ABA).
        // The users row is already locked by save(), so first import and replacement are serialized.
        var values = jdbc.queryForList("SELECT revision FROM student_timetable_versions WHERE user_id = ?", Integer.class, userId);
        int next = Math.max(previous, values.isEmpty() ? 0 : values.get(0)) + 1;
        if (next > 1000000) throw conflict();
        if (values.isEmpty()) jdbc.update("INSERT INTO student_timetable_versions(user_id,revision) VALUES(?,?)", userId, next);
        else jdbc.update("UPDATE student_timetable_versions SET revision=? WHERE user_id=?", next, userId);
        return next;
    }
    @Transactional
    public State checked(Long userId, int revision) {
        if (jdbc.update("UPDATE student_timetables SET checked_at=CURRENT_TIMESTAMP WHERE user_id = ? AND revision = ?", userId, revision) != 1) throw conflict();
        return get(userId);
    }
    @Transactional
    public void delete(Long userId, int revision) {
        if (jdbc.update("DELETE FROM student_timetables WHERE user_id = ? AND revision = ?", userId, revision) != 1) throw conflict();
    }
    private static Snapshot snapshot(ResultSet rs) throws SQLException {
        return new Snapshot(rs.getInt("revision"), rs.getString("semester"), rs.getDate("first_monday").toLocalDate(),
                rs.getInt("start_week"), rs.getInt("end_week"), rs.getInt("remind_days"), rs.getString("image_sha256"),
                rs.getTimestamp("imported_at").toInstant(), rs.getTimestamp("checked_at").toInstant());
    }
    static void validate(Input input) {
        if (input == null || input.revision() < 0 || input.revision() > 1000000 || input.semester() == null
                || input.semester().isBlank() || input.semester().length() > 100
                || input.semester().codePoints().anyMatch(c -> c < 32 || c == 127) || input.firstMonday() == null
                || input.firstMonday().getYear() < 2000 || input.firstMonday().getYear() > 2100
                || input.firstMonday().getDayOfWeek().getValue() != 1 || input.startWeek() < 1
                || input.endWeek() > 30 || input.endWeek() < input.startWeek() || input.remindDays() < 0 || input.remindDays() > 30) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "请填写学期、第1周周一日期及正确的覆盖周次，提醒间隔为0至30天");
        }
    }
    static SafeImage sanitize(byte[] bytes) {
        if (bytes == null || bytes.length == 0 || bytes.length > MAX_IMAGE_BYTES)
            throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "课表图片应小于2MB，请压缩或裁剪后重试");
        try (var stream = new javax.imageio.stream.MemoryCacheImageInputStream(new ByteArrayInputStream(bytes))) {
            var readers = ImageIO.getImageReaders(stream);
            if (!readers.hasNext()) throw invalidImage();
            var reader = readers.next();
            try {
                reader.setInput(stream, true, true);
                String format = reader.getFormatName().toLowerCase(java.util.Locale.ROOT);
                if (!format.equals("png") && !format.equals("jpeg")) throw invalidImage();
                int width = reader.getWidth(0), height = reader.getHeight(0);
                if (width < 1 || height < 1 || width > 10000 || height > 10000 || (long) width * height > 12000000)
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "图片尺寸过大，请裁剪课表区域后重试");
                // Decode then encode fresh pixels. Uploaded metadata and trailing payload are discarded.
                var pixels = reader.read(0);
                var output = new ByteArrayOutputStream();
                try (var encoded = new javax.imageio.stream.MemoryCacheImageOutputStream(output)) {
                    if (!ImageIO.write(pixels, format, encoded)) throw invalidImage();
                    encoded.flush();
                }
                byte[] safe = output.toByteArray();
                if (safe.length > MAX_IMAGE_BYTES) throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "处理后的图片超过2MB，请缩小或改为JPG");
                return new SafeImage(safe, format.equals("png") ? "image/png" : "image/jpeg",
                        HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(safe)));
            } finally { reader.dispose(); }
        } catch (ResponseStatusException e) { throw e; }
        catch (Exception e) { throw invalidImage(); }
    }
    private static ResponseStatusException invalidImage() { return new ResponseStatusException(HttpStatus.BAD_REQUEST, "图片无法解析，仅支持真实PNG或JPG课表截图"); }
    private static ResponseStatusException conflict() { return new ResponseStatusException(HttpStatus.CONFLICT, "课表已在另一页面更新，请保留当前截图并重新读取后操作"); }
}
