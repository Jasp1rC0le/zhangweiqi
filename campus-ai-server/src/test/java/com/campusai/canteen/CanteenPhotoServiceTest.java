package com.campusai.canteen;

import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import javax.imageio.ImageIO;
import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CanteenPhotoServiceTest {
    @Test
    void rewritesPngAsBoundedJpeg() throws Exception {
        BufferedImage original = new BufferedImage(1600, 800, BufferedImage.TYPE_INT_RGB);
        original.setRGB(0, 0, Color.BLUE.getRGB());
        ByteArrayOutputStream source = new ByteArrayOutputStream();
        ImageIO.write(original, "png", source);

        byte[] normalized = CanteenPhotoService.normalize(source.toByteArray());
        BufferedImage output = ImageIO.read(new ByteArrayInputStream(normalized));

        assertThat(normalized[0] & 0xff).isEqualTo(0xff);
        assertThat(normalized[1] & 0xff).isEqualTo(0xd8);
        assertThat(output.getWidth()).isEqualTo(1600);
        assertThat(output.getHeight()).isEqualTo(800);
    }

    @Test
    void rejectsNonImagePayload() {
        assertThatThrownBy(() -> CanteenPhotoService.normalize("not-an-image".getBytes()))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("JPEG或PNG");
    }
}
