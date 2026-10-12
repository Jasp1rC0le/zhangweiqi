package com.campusai.timetable;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.web.server.ResponseStatusException;
import java.awt.image.BufferedImage;
import javax.imageio.ImageIO;
import java.io.ByteArrayOutputStream;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;

@Timeout(10)
class TimetableServiceTest {
    JdbcTemplate jdbc;
    TimetableService service;
    byte[] png;
    @BeforeEach void setup() throws Exception {
        var ds = new DriverManagerDataSource("jdbc:h2:mem:tt"+UUID.randomUUID()+";MODE=MySQL;DB_CLOSE_DELAY=-1", "sa", "");
        jdbc = new JdbcTemplate(ds);
        jdbc.execute("CREATE TABLE users(id BIGINT PRIMARY KEY)");
        jdbc.update("INSERT INTO users VALUES(1),(2)");
        jdbc.execute("CREATE TABLE student_timetable_versions(user_id BIGINT PRIMARY KEY,revision INT NOT NULL,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)");
        jdbc.execute("CREATE TABLE student_timetables(user_id BIGINT PRIMARY KEY,revision INT NOT NULL,semester VARCHAR(100),first_monday DATE,start_week INT,end_week INT,remind_days INT,image_bytes BLOB,image_mime VARCHAR(20),image_sha256 CHAR(64),imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)");
        service = new TimetableService(jdbc);
        var out = new ByteArrayOutputStream(); ImageIO.write(new BufferedImage(20,10,BufferedImage.TYPE_INT_RGB),"png",out); png=out.toByteArray();
    }
    TimetableService.Input input(int rev) { return new TimetableService.Input(rev,"2026—2027 第1学期",LocalDate.of(2026,9,7),1,18,7); }
    @Test void savesPrivatePixelsAndRepeatedImportIsIdempotent() {
        assertNull(service.get(1L).timetable());
        var saved=service.save(1L,input(0),png).timetable(); assertEquals(1,saved.revision());
        assertEquals(64,saved.imageSha256().length()); assertEquals("image/png",service.image(1L,1).mime());
        assertEquals(1,service.save(1L,input(1),png).timetable().revision());
        assertEquals(1,jdbc.queryForObject("SELECT COUNT(*) FROM student_timetables",Integer.class));
        assertNull(service.get(2L).timetable());
        assertThrows(ResponseStatusException.class,()->service.image(2L,1));
    }
    @Test void revisionConflictDoesNotOverwriteAndRefreshReflectsNewMetadata() {
        service.save(1L,input(0),png);
        var next=new TimetableService.Input(1,"下一个学期",LocalDate.of(2026,9,7),1,18,14);
        assertEquals(2,service.save(1L,next,png).timetable().revision());
        assertEquals(409,assertThrows(ResponseStatusException.class,()->service.save(1L,input(1),png)).getStatusCode().value());
        assertEquals("下一个学期",service.get(1L).timetable().semester());
        assertThrows(ResponseStatusException.class,()->service.image(1L,1));
    }
    @Test void checkAndDeleteCannotCrossOwnerOrStaleRevision() {
        service.save(1L,input(0),png);
        assertThrows(ResponseStatusException.class,()->service.checked(2L,1));
        assertThrows(ResponseStatusException.class,()->service.delete(2L,1));
        assertThrows(ResponseStatusException.class,()->service.delete(1L,2));
        assertNotNull(service.checked(1L,1).timetable().checkedAt());
        service.delete(1L,1); assertNull(service.get(1L).timetable());
    }
    @Test void userErasureCascadesAndDoesNotEraseOtherOwners() {
        service.save(1L,input(0),png); service.save(2L,input(0),png);
        jdbc.update("DELETE FROM users WHERE id=1"); assertNull(service.get(1L).timetable()); assertNotNull(service.get(2L).timetable());
        assertEquals(1,jdbc.queryForObject("SELECT COUNT(*) FROM student_timetable_versions",Integer.class));
    }
    @Test void staleTabCannotChangeOrDeleteARecreatedTimetable() {
        service.save(1L,input(0),png);
        service.delete(1L,1);
        assertEquals(2,service.save(1L,input(0),png).timetable().revision());
        assertEquals(409,assertThrows(ResponseStatusException.class,()->service.save(1L,input(1),png)).getStatusCode().value());
        assertEquals(409,assertThrows(ResponseStatusException.class,()->service.checked(1L,1)).getStatusCode().value());
        assertEquals(409,assertThrows(ResponseStatusException.class,()->service.delete(1L,1)).getStatusCode().value());
        assertThrows(ResponseStatusException.class,()->service.image(1L,1));
        assertEquals(2,service.get(1L).timetable().revision());
    }
    @Test void validatesDateCoverageSemesterAndReminderBeforeDatabaseWrite() {
        for (var invalid : new TimetableService.Input[] { null, new TimetableService.Input(0," ",LocalDate.of(2026,9,7),1,18,7), new TimetableService.Input(0,"test",LocalDate.of(2026,9,8),1,18,7), new TimetableService.Input(0,"test",LocalDate.of(2026,9,7),4,3,7), new TimetableService.Input(0,"test",LocalDate.of(2026,9,7),1,31,7), new TimetableService.Input(0,"test",LocalDate.of(2026,9,7),1,18,31) }) {
            assertEquals(400,assertThrows(ResponseStatusException.class,()->service.save(1L,invalid,png)).getStatusCode().value());
        }
        assertNull(service.get(1L).timetable());
    }
    @Test void rewritesImageAndStripsTrailingPayload() throws Exception {
        byte[] withPayload=Arrays.copyOf(png,png.length+20); System.arraycopy("secret-trailing".getBytes(),0,withPayload,png.length,15);
        var clean=TimetableService.sanitize(withPayload);
        assertArrayEquals(png,clean.bytes()); assertEquals("image/png",clean.mime());
        var out = new ByteArrayOutputStream(); ImageIO.write(new BufferedImage(20,10,BufferedImage.TYPE_INT_RGB),"jpg",out);
        assertEquals("image/jpeg",TimetableService.sanitize(out.toByteArray()).mime());
    }
    @Test void rejectsMultilineSemesterWithoutChangingSavedData() {
        service.save(1L,input(0),png);
        for (String semester : new String[]{"学期\n姓名", "学期\t学号", "学期\u0000", "学期\u007f"}) {
            var invalid=new TimetableService.Input(1,semester,LocalDate.of(2026,9,7),1,18,7);
            assertEquals(400,assertThrows(ResponseStatusException.class,()->service.save(1L,invalid,png)).getStatusCode().value());
        }
        assertEquals(1,service.get(1L).timetable().revision());
        assertEquals(input(0).semester(),service.get(1L).timetable().semester());
    }
    @Test void rejectsFakeSvgGifCorruptOversizeAndExtremeDimensions() throws Exception {
        for(byte[] invalid:new byte[][] { "<svg/>".getBytes(), "not-an-image".getBytes(), Arrays.copyOf(png,20) }) assertThrows(ResponseStatusException.class,()->TimetableService.sanitize(invalid));
        assertEquals(413,assertThrows(ResponseStatusException.class,()->TimetableService.sanitize(new byte[TimetableService.MAX_IMAGE_BYTES+1])).getStatusCode().value());
        var out=new ByteArrayOutputStream(); ImageIO.write(new BufferedImage(2,2,BufferedImage.TYPE_INT_RGB),"gif",out);
        assertThrows(ResponseStatusException.class,()->TimetableService.sanitize(out.toByteArray()));
        out.reset(); ImageIO.write(new BufferedImage(10001,1,BufferedImage.TYPE_INT_RGB),"png",out);
        assertThrows(ResponseStatusException.class,()->TimetableService.sanitize(out.toByteArray()));
    }
}
