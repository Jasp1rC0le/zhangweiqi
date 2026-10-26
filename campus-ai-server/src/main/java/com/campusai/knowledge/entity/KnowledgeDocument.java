package com.campusai.knowledge.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class KnowledgeDocument {

    private Long id;
    private Long schoolId;
    private String title;
    private String category;
    private String sourceDepartment;
    private String sourceUrl;

    private LocalDateTime publishedAt;
    private LocalDateTime effectiveAt;
    private LocalDateTime expiresAt;

    private String status;
    private String contentHash;
    private String rawContent;
    private Integer versionNumber;
    private Boolean hasSuccessor;

    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    /** Optimistic preview token, not a credential. Includes metadata so a date/title edit invalidates a chat preview too. */
    public String getRevisionTag() {
        try {
            var digest=java.security.MessageDigest.getInstance("SHA-256");
            for(Object field:new Object[]{id,schoolId,title,category,sourceDepartment,sourceUrl,publishedAt,effectiveAt,expiresAt,status,contentHash,versionNumber,hasSuccessor,updatedAt}) {
                byte[] bytes=field==null?new byte[0]:field.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8);
                digest.update(java.nio.ByteBuffer.allocate(4).putInt(field==null?-1:bytes.length).array());digest.update(bytes);
            }
            return java.util.HexFormat.of().formatHex(digest.digest());
        } catch(java.security.NoSuchAlgorithmException impossible) {throw new IllegalStateException(impossible);}
    }
}
