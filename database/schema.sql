CREATE DATABASE IF NOT EXISTS campus_ai
    DEFAULT CHARACTER SET utf8mb4
    DEFAULT COLLATE utf8mb4_0900_ai_ci;

USE campus_ai;

CREATE TABLE IF NOT EXISTS schools (
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '学校ID',
    name VARCHAR(120) NOT NULL UNIQUE COMMENT '学校名称',
    code VARCHAR(50) NOT NULL UNIQUE COMMENT '学校编码',
    status TINYINT NOT NULL DEFAULT 1 COMMENT '1启用，0停用',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) COMMENT='学校表';

INSERT INTO schools (name, code, status)
VALUES ('天津中德应用技术大学', 'TSGUAS', 1)
ON DUPLICATE KEY UPDATE
    name = VALUES(name),
    status = VALUES(status);

CREATE TABLE IF NOT EXISTS users (
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '用户ID',
    school_id BIGINT NOT NULL COMMENT '所属学校',
    username VARCHAR(50) NOT NULL UNIQUE COMMENT '登录账号',
    password_hash VARCHAR(255) NOT NULL COMMENT '加密后的密码',
    nickname VARCHAR(50) NOT NULL COMMENT '昵称',
    role VARCHAR(20) NOT NULL DEFAULT 'STUDENT' COMMENT '角色',
    status TINYINT NOT NULL DEFAULT 1 COMMENT '1正常，0禁用',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_user_school (school_id),
    CONSTRAINT fk_user_school FOREIGN KEY (school_id) REFERENCES schools (id)
) COMMENT='用户表';

CREATE TABLE IF NOT EXISTS ai_conversations (
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '会话ID',
    user_id BIGINT NOT NULL COMMENT '所属用户',
    title VARCHAR(100) NOT NULL DEFAULT '新对话' COMMENT '会话标题',
    model VARCHAR(50) NOT NULL DEFAULT 'standard' COMMENT '回答模式档位',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_conversation_user_updated (user_id, updated_at),
    CONSTRAINT fk_conversation_user FOREIGN KEY (user_id) REFERENCES users (id)
) COMMENT='AI会话表';

CREATE TABLE IF NOT EXISTS ai_messages (
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '消息ID',
    conversation_id BIGINT NOT NULL COMMENT '所属会话',
    role VARCHAR(20) NOT NULL COMMENT 'user、assistant或system',
    content LONGTEXT NOT NULL COMMENT '消息正文',
    token_count INT NULL COMMENT 'Token数量',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_message_conversation_created (conversation_id, created_at),
    CONSTRAINT fk_message_conversation FOREIGN KEY (conversation_id)
        REFERENCES ai_conversations (id) ON DELETE CASCADE
) COMMENT='AI消息表';

CREATE TABLE IF NOT EXISTS knowledge_documents (
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '资料ID',
    school_id BIGINT NOT NULL COMMENT '所属学校',
    title VARCHAR(200) NOT NULL COMMENT '资料标题',
    category VARCHAR(50) NOT NULL COMMENT '资料分类',
    source_department VARCHAR(100) NULL COMMENT '发布部门',
    source_url VARCHAR(1000) NULL COMMENT '原始链接',
    published_at DATETIME NULL COMMENT '发布时间',
    effective_at DATETIME NULL COMMENT '生效时间',
    expires_at DATETIME NULL COMMENT '失效时间',
    status VARCHAR(20) NOT NULL DEFAULT 'PUBLISHED' COMMENT '资料状态',
    content_hash CHAR(64) NOT NULL COMMENT '正文SHA-256',
    raw_content LONGTEXT NULL COMMENT '导入时的完整原文',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_document_school_hash (school_id, content_hash),
    INDEX idx_document_school_status (school_id, status, published_at),
    CONSTRAINT fk_document_school FOREIGN KEY (school_id) REFERENCES schools (id)
) COMMENT='校园知识资料表';

CREATE TABLE IF NOT EXISTS knowledge_chunks (
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '知识片段ID',
    document_id BIGINT NOT NULL COMMENT '所属资料',
    chunk_index INT NOT NULL COMMENT '片段顺序',
    content LONGTEXT NOT NULL COMMENT '片段正文',
    char_count INT NOT NULL COMMENT '字符数',
    token_count INT NULL COMMENT 'Token估算数',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_chunk_document_index (document_id, chunk_index),
    FULLTEXT KEY ft_chunk_content (content),
    CONSTRAINT fk_chunk_document FOREIGN KEY (document_id)
        REFERENCES knowledge_documents (id) ON DELETE CASCADE
) COMMENT='校园知识片段表';

CREATE TABLE IF NOT EXISTS ai_message_citations (
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '引用ID',
    message_id BIGINT NOT NULL COMMENT 'AI消息ID',
    chunk_id BIGINT NOT NULL COMMENT '知识片段ID',
    citation_index INT NOT NULL COMMENT '回答中的资料序号',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_citation_message_index (message_id, citation_index),
    INDEX idx_citation_chunk (chunk_id),
    CONSTRAINT fk_citation_message FOREIGN KEY (message_id)
        REFERENCES ai_messages (id) ON DELETE CASCADE,
    CONSTRAINT fk_citation_chunk FOREIGN KEY (chunk_id)
        REFERENCES knowledge_chunks (id) ON DELETE CASCADE
) COMMENT='AI消息引用来源表';

CREATE TABLE IF NOT EXISTS ai_message_feedback (
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '反馈ID',
    message_id BIGINT NOT NULL COMMENT '被评价的AI消息',
    user_id BIGINT NOT NULL COMMENT '评价用户',
    helpful TINYINT(1) NOT NULL COMMENT '1有帮助，0没帮助',
    reason VARCHAR(500) NULL COMMENT '用户补充说明',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_feedback_user_message (user_id, message_id),
    INDEX idx_feedback_helpful_updated (helpful, updated_at),
    CONSTRAINT fk_feedback_message FOREIGN KEY (message_id)
        REFERENCES ai_messages (id) ON DELETE CASCADE,
    CONSTRAINT fk_feedback_user FOREIGN KEY (user_id)
        REFERENCES users (id) ON DELETE CASCADE
) COMMENT='AI回答质量反馈表';

CREATE TABLE IF NOT EXISTS knowledge_submissions (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    school_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    question VARCHAR(1000) NOT NULL,
    content LONGTEXT NOT NULL,
    source_url VARCHAR(1000) NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    review_note VARCHAR(500) NULL,
    reviewed_by BIGINT NULL,
    reviewed_at DATETIME NULL,
    knowledge_document_id BIGINT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_submission_user_created (user_id, created_at),
    INDEX idx_submission_school_status (school_id, status, created_at),
    CONSTRAINT fk_submission_school FOREIGN KEY (school_id) REFERENCES schools (id),
    CONSTRAINT fk_submission_user FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT fk_submission_reviewer FOREIGN KEY (reviewed_by) REFERENCES users (id),
    CONSTRAINT fk_submission_document FOREIGN KEY (knowledge_document_id)
        REFERENCES knowledge_documents (id)
) COMMENT='用户校园知识补充审核表';

CREATE TABLE IF NOT EXISTS contact_messages (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NULL,
    school_id BIGINT NULL,
    name VARCHAR(80) NOT NULL,
    contact VARCHAR(120) NOT NULL,
    subject VARCHAR(120) NOT NULL,
    message TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'NEW',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_contact_status_created (status, created_at),
    CONSTRAINT fk_contact_user FOREIGN KEY (user_id)
        REFERENCES users (id) ON DELETE SET NULL,
    CONSTRAINT fk_contact_school FOREIGN KEY (school_id)
        REFERENCES schools (id) ON DELETE SET NULL
) COMMENT='站内联系与反馈消息表';
