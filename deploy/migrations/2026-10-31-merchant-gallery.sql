-- Optional additional menus. Run explicitly; existing merchant, cover and ratings stay intact.
CREATE TABLE IF NOT EXISTS campus_merchant_photo_gallery (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    merchant_id BIGINT NOT NULL,
    school_id BIGINT NOT NULL,
    jpeg_data MEDIUMBLOB NOT NULL,
    content_sha256 CHAR(64) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_merchant_gallery_content (merchant_id, content_sha256),
    CONSTRAINT fk_gallery_merchant_school FOREIGN KEY (merchant_id, school_id)
        REFERENCES campus_canteen_merchants (id, school_id) ON DELETE CASCADE
) COMMENT='同一商家的额外菜单照片，重编码并按内容去重';
