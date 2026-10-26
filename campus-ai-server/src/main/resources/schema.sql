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

CREATE TABLE IF NOT EXISTS auth_sessions (
    id CHAR(36) PRIMARY KEY,
    user_id BIGINT NOT NULL,
    refresh_hash CHAR(64) NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    revoked_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_auth_session_user (user_id, revoked_at),
    INDEX idx_auth_session_expiry (expires_at),
    CONSTRAINT fk_auth_session_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) COMMENT='可撤销登录会话，刷新令牌只存摘要';

CREATE TABLE IF NOT EXISTS auth_login_attempts (
    bucket_key CHAR(64) PRIMARY KEY,
    window_start DATETIME NOT NULL,
    attempts INT NOT NULL DEFAULT 0,
    INDEX idx_login_attempt_window (window_start)
) COMMENT='登录限频窗口，不保存明文账号和IP';

CREATE TABLE IF NOT EXISTS account_emails (
    user_id BIGINT PRIMARY KEY,
    email VARCHAR(254) NOT NULL UNIQUE,
    verified_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_account_email_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) COMMENT='已验证的找回邮箱';

CREATE TABLE IF NOT EXISTS account_action_tokens (
    token_hash CHAR(64) PRIMARY KEY,
    user_id BIGINT NOT NULL,
    action VARCHAR(24) NOT NULL,
    pending_email VARCHAR(254) NULL,
    expires_at DATETIME NOT NULL,
    used_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_account_action_user (user_id, action, used_at),
    INDEX idx_account_action_expiry (expires_at),
    CONSTRAINT fk_account_action_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) COMMENT='邮箱验证及重置密码一次性令牌，仅存摘要';

CREATE TABLE IF NOT EXISTS user_privacy_consents (
    user_id BIGINT PRIMARY KEY,
    policy_version VARCHAR(20) NOT NULL,
    accepted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_privacy_consent_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) COMMENT='注册时隐私说明确认记录';

CREATE TABLE IF NOT EXISTS user_profiles (
    user_id BIGINT PRIMARY KEY,
    major VARCHAR(100) NULL COMMENT '专业',
    grade VARCHAR(50) NULL COMMENT '年级',
    skills_json TEXT NOT NULL COMMENT '技能标签JSON数组',
    career_direction VARCHAR(200) NULL COMMENT '求职或发展方向',
    bio VARCHAR(500) NULL COMMENT '用户自述',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_user_profile_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) COMMENT='用户自愿填写的个性化画像';

CREATE TABLE IF NOT EXISTS background_jobs (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    school_id BIGINT NOT NULL,
    job_type VARCHAR(50) NOT NULL,
    ref_id BIGINT NULL,
    dedupe_key VARCHAR(191) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    attempt_count INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 5,
    available_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    locked_at DATETIME NULL,
    last_error VARCHAR(500) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_background_job_dedupe (job_type, dedupe_key),
    INDEX idx_background_job_poll (status, available_at, id),
    CONSTRAINT fk_background_job_school FOREIGN KEY (school_id) REFERENCES schools (id)
) COMMENT='轻量持久任务队列，适合单机部署并可平滑迁移到独立消息队列';

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

CREATE TABLE IF NOT EXISTS ai_model_usage (
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '用量记录ID',
    message_id BIGINT NULL COMMENT '对应AI回答，删除会话后保留用量',
    user_id BIGINT NOT NULL COMMENT '发起请求的用户',
    provider VARCHAR(32) NOT NULL COMMENT '模型供应商',
    model VARCHAR(100) NULL COMMENT '供应商模型名称',
    prompt_tokens INT NULL COMMENT '输入Token数',
    completion_tokens INT NULL COMMENT '输出Token数',
    total_tokens INT NULL COMMENT '总Token数',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_model_usage_message (message_id),
    INDEX idx_model_usage_user_created (user_id, created_at),
    CONSTRAINT fk_model_usage_message FOREIGN KEY (message_id)
        REFERENCES ai_messages (id) ON DELETE SET NULL,
    CONSTRAINT fk_model_usage_user FOREIGN KEY (user_id)
        REFERENCES users (id)
) COMMENT='AI模型调用用量表';

CREATE TABLE IF NOT EXISTS ai_daily_quota (
    user_id BIGINT NOT NULL,
    usage_date DATE NOT NULL,
    request_count INT NOT NULL DEFAULT 0,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, usage_date),
    CONSTRAINT fk_daily_quota_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) COMMENT='用户每日AI外部模型请求额度';

CREATE TABLE IF NOT EXISTS ai_daily_token_quota (
    user_id BIGINT NOT NULL,
    usage_date DATE NOT NULL,
    used_tokens INT NOT NULL DEFAULT 0,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, usage_date),
    CONSTRAINT fk_daily_token_quota_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) COMMENT='用户每日AI模型Token额度（含进行中的预留）';

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

CREATE TABLE IF NOT EXISTS knowledge_update_candidates (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    school_id BIGINT NOT NULL,
    document_id BIGINT NOT NULL,
    source_url VARCHAR(1000) NOT NULL,
    detected_title VARCHAR(200) NOT NULL,
    detected_content LONGTEXT NOT NULL,
    previous_hash CHAR(64) NOT NULL,
    detected_hash CHAR(64) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    detected_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_by BIGINT NULL,
    reviewed_at DATETIME NULL,
    UNIQUE KEY uk_knowledge_update_version (document_id, detected_hash),
    INDEX idx_knowledge_update_school_status (school_id, status, detected_at),
    CONSTRAINT fk_knowledge_update_school FOREIGN KEY (school_id) REFERENCES schools (id),
    CONSTRAINT fk_knowledge_update_document FOREIGN KEY (document_id)
        REFERENCES knowledge_documents (id) ON DELETE CASCADE,
    CONSTRAINT fk_knowledge_update_reviewer FOREIGN KEY (reviewed_by) REFERENCES users (id)
) COMMENT='官网资料变更候选，管理员确认后才生成新版本';

CREATE TABLE IF NOT EXISTS campus_employers (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    school_id BIGINT NOT NULL,
    name VARCHAR(200) NOT NULL,
    industry VARCHAR(100) NULL,
    website_url VARCHAR(1000) NULL,
    description TEXT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_employer_school_name (school_id, name),
    UNIQUE KEY uk_employer_id_school (id, school_id),
    INDEX idx_employer_school_status (school_id, status),
    CONSTRAINT fk_employer_school FOREIGN KEY (school_id) REFERENCES schools (id)
) COMMENT='本校校企合作与招聘企业结构化资料';

CREATE TABLE IF NOT EXISTS campus_employer_candidates (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    school_id BIGINT NOT NULL,
    discovery_query VARCHAR(300) NOT NULL,
    candidate_name VARCHAR(300) NOT NULL,
    source_url VARCHAR(1000) NOT NULL,
    source_hash CHAR(64) NOT NULL,
    source_domain VARCHAR(255) NULL,
    source_summary TEXT NULL,
    published_date VARCHAR(80) NULL,
    source_quality VARCHAR(20) NOT NULL DEFAULT 'UNVERIFIED',
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    employer_id BIGINT NULL,
    reviewed_by BIGINT NULL,
    reviewed_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_employer_candidate_source (school_id, source_hash),
    INDEX idx_employer_candidate_review (school_id, status, created_at),
    CONSTRAINT fk_employer_candidate_school FOREIGN KEY (school_id) REFERENCES schools (id),
    CONSTRAINT fk_employer_candidate_employer FOREIGN KEY (employer_id) REFERENCES campus_employers (id),
    CONSTRAINT fk_employer_candidate_reviewer FOREIGN KEY (reviewed_by) REFERENCES users (id)
) COMMENT='联网发现的企业线索，管理员审核后才可转为正式企业资料';

CREATE TABLE IF NOT EXISTS campus_jobs (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    school_id BIGINT NOT NULL,
    employer_id BIGINT NOT NULL,
    title VARCHAR(200) NOT NULL,
    employment_type VARCHAR(50) NULL,
    location VARCHAR(200) NULL,
    source_url VARCHAR(1000) NULL,
    description TEXT NOT NULL,
    posted_at DATETIME NULL,
    expires_at DATETIME NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_job_school_status_expiry (school_id, status, expires_at),
    INDEX idx_job_employer (employer_id),
    CONSTRAINT fk_job_school FOREIGN KEY (school_id) REFERENCES schools (id),
    CONSTRAINT fk_job_employer_school FOREIGN KEY (employer_id, school_id)
        REFERENCES campus_employers (id, school_id)
) COMMENT='招聘岗位结构化资料';

CREATE TABLE IF NOT EXISTS campus_canteens (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    school_id BIGINT NOT NULL,
    name VARCHAR(120) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_canteen_school_name (school_id, name),
    UNIQUE KEY uk_canteen_id_school (id, school_id),
    INDEX idx_canteen_school_status (school_id, status),
    CONSTRAINT fk_canteen_school FOREIGN KEY (school_id) REFERENCES schools (id)
) COMMENT='本校食堂，管理员核实后发布';

CREATE TABLE IF NOT EXISTS campus_canteen_merchants (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    school_id BIGINT NOT NULL,
    canteen_id BIGINT NOT NULL,
    name VARCHAR(120) NOT NULL,
    location VARCHAR(120) NULL,
    description VARCHAR(1000) NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    operating_status VARCHAR(20) NOT NULL DEFAULT 'UNKNOWN',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_merchant_canteen_name (canteen_id, name),
    UNIQUE KEY uk_merchant_id_school (id, school_id),
    INDEX idx_merchant_school_status (school_id, status, canteen_id),
    CONSTRAINT fk_merchant_canteen_school FOREIGN KEY (canteen_id, school_id)
        REFERENCES campus_canteens (id, school_id)
) COMMENT='食堂商家资料，草稿与营业状态分开管理';

CREATE TABLE IF NOT EXISTS campus_merchant_ratings (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    merchant_id BIGINT NOT NULL,
    school_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    score TINYINT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_merchant_rating_user (merchant_id, user_id),
    INDEX idx_rating_merchant (merchant_id, score),
    INDEX idx_rating_user (user_id),
    CONSTRAINT fk_rating_merchant_school FOREIGN KEY (merchant_id, school_id)
        REFERENCES campus_canteen_merchants (id, school_id),
    CONSTRAINT fk_rating_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT chk_rating_score CHECK (score BETWEEN 1 AND 5)
) COMMENT='学生对每家商家一条可修改评分';

CREATE TABLE IF NOT EXISTS campus_merchant_reviews (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    merchant_id BIGINT NOT NULL,
    school_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    comment_text VARCHAR(500) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_merchant_review_user (merchant_id, user_id),
    INDEX idx_review_school_status_updated (school_id, status, updated_at),
    CONSTRAINT fk_review_rating FOREIGN KEY (merchant_id, user_id)
        REFERENCES campus_merchant_ratings (merchant_id, user_id) ON DELETE CASCADE,
    CONSTRAINT fk_review_merchant_school FOREIGN KEY (merchant_id, school_id)
        REFERENCES campus_canteen_merchants (id, school_id)
) COMMENT='学生短评需审核后展示；星级评分独立即时统计';

CREATE TABLE IF NOT EXISTS campus_review_likes (
    review_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (review_id, user_id),
    INDEX idx_review_like_user (user_id),
    CONSTRAINT fk_review_like_review FOREIGN KEY (review_id) REFERENCES campus_merchant_reviews(id) ON DELETE CASCADE,
    CONSTRAINT fk_review_like_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) COMMENT='短评点赞，一账号一票；不公开点赞者身份';

CREATE TABLE IF NOT EXISTS campus_merchant_photos (
    merchant_id BIGINT PRIMARY KEY,
    school_id BIGINT NOT NULL,
    jpeg_data MEDIUMBLOB NOT NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_photo_merchant_school FOREIGN KEY (merchant_id, school_id)
        REFERENCES campus_canteen_merchants (id, school_id) ON DELETE CASCADE
) COMMENT='管理员上传、统一压缩并移除元数据的商家照片';

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

CREATE TABLE IF NOT EXISTS knowledge_eval_cases (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    school_id BIGINT NOT NULL,
    question VARCHAR(500) NOT NULL,
    expected_document_id BIGINT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_eval_school_question (school_id, question),
    INDEX idx_eval_document (expected_document_id),
    CONSTRAINT fk_eval_school FOREIGN KEY (school_id) REFERENCES schools (id),
    CONSTRAINT fk_eval_document FOREIGN KEY (expected_document_id) REFERENCES knowledge_documents (id)
) COMMENT='固定校园问题检索评测集';

CREATE TABLE IF NOT EXISTS knowledge_document_events (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    document_id BIGINT NOT NULL,
    actor_id BIGINT NOT NULL,
    old_status VARCHAR(20) NULL,
    new_status VARCHAR(20) NOT NULL,
    note VARCHAR(500) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_document_event (document_id, created_at),
    CONSTRAINT fk_document_event_document FOREIGN KEY (document_id) REFERENCES knowledge_documents (id),
    CONSTRAINT fk_document_event_actor FOREIGN KEY (actor_id) REFERENCES users (id)
) COMMENT='校园资料上下架审计记录';

CREATE TABLE IF NOT EXISTS knowledge_chunk_embeddings (
    chunk_id BIGINT PRIMARY KEY,
    model VARCHAR(60) NOT NULL,
    dimensions INT NOT NULL,
    vector_json LONGTEXT NOT NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_embedding_model (model),
    CONSTRAINT fk_embedding_chunk FOREIGN KEY (chunk_id)
        REFERENCES knowledge_chunks (id) ON DELETE CASCADE
) COMMENT='校园知识片段语义向量';

CREATE TABLE IF NOT EXISTS knowledge_document_versions (
    document_id BIGINT PRIMARY KEY,
    root_document_id BIGINT NOT NULL,
    version_number INT NOT NULL,
    supersedes_document_id BIGINT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_document_version (root_document_id, version_number),
    CONSTRAINT fk_version_document FOREIGN KEY (document_id) REFERENCES knowledge_documents (id),
    CONSTRAINT fk_version_root FOREIGN KEY (root_document_id) REFERENCES knowledge_documents (id),
    CONSTRAINT fk_version_previous FOREIGN KEY (supersedes_document_id) REFERENCES knowledge_documents (id)
) COMMENT='校园资料不可变版本链';

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

CREATE TABLE IF NOT EXISTS ai_feedback_resolutions (
    feedback_id BIGINT PRIMARY KEY,
    reviewer_id BIGINT NOT NULL,
    document_id BIGINT NULL,
    resolution_note VARCHAR(500) NOT NULL,
    resolved_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_resolution_feedback FOREIGN KEY (feedback_id)
        REFERENCES ai_message_feedback (id) ON DELETE CASCADE,
    CONSTRAINT fk_resolution_reviewer FOREIGN KEY (reviewer_id) REFERENCES users (id),
    CONSTRAINT fk_resolution_document FOREIGN KEY (document_id) REFERENCES knowledge_documents (id)
) COMMENT='回答纠错处理记录';

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
    CONSTRAINT fk_submission_school
        FOREIGN KEY (school_id) REFERENCES schools (id),
    CONSTRAINT fk_submission_user
        FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT fk_submission_reviewer
        FOREIGN KEY (reviewed_by) REFERENCES users (id),
    CONSTRAINT fk_submission_document
        FOREIGN KEY (knowledge_document_id) REFERENCES knowledge_documents (id)
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
    CONSTRAINT fk_contact_user
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL,
    CONSTRAINT fk_contact_school
        FOREIGN KEY (school_id) REFERENCES schools (id) ON DELETE SET NULL
) COMMENT='站内联系与反馈消息表';

-- Stores identifiers only. Deletion of feedback/account removes its retry receipt.
CREATE TABLE IF NOT EXISTS contact_submission_keys (
    user_id BIGINT NOT NULL,
    request_id CHAR(36) NOT NULL,
    message_id BIGINT NOT NULL,
    PRIMARY KEY(user_id, request_id),
    CONSTRAINT fk_contact_key_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_contact_key_message FOREIGN KEY (message_id) REFERENCES contact_messages(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS student_timetable_versions (
    user_id BIGINT PRIMARY KEY,
    revision INT NOT NULL,
    CONSTRAINT fk_timetable_version_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS student_timetables (
    user_id BIGINT PRIMARY KEY,
    revision INT NOT NULL DEFAULT 1,
    semester VARCHAR(100) NOT NULL,
    first_monday DATE NOT NULL,
    start_week INT NOT NULL,
    end_week INT NOT NULL,
    remind_days INT NOT NULL DEFAULT 7,
    image_bytes MEDIUMBLOB NOT NULL,
    image_mime VARCHAR(20) NOT NULL,
    image_sha256 CHAR(64) NOT NULL,
    imported_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    checked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_timetable_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS student_course_schedule_versions (
    user_id BIGINT PRIMARY KEY,
    revision INT NOT NULL,
    CONSTRAINT fk_course_schedule_version_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS student_course_schedules (
    user_id BIGINT PRIMARY KEY,
    revision INT NOT NULL,
    semester VARCHAR(100) NOT NULL,
    first_monday DATE NOT NULL,
    remind_days INT NOT NULL DEFAULT 7,
    courses_json MEDIUMTEXT NOT NULL,
    imported_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    checked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_course_schedule_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS personal_schedule_terms (
    owner_id BIGINT NOT NULL, first_monday DATE NOT NULL, revision INT NOT NULL,
    semester VARCHAR(100) NOT NULL, snapshot_json MEDIUMTEXT NOT NULL,
    PRIMARY KEY(owner_id,first_monday),
    CONSTRAINT fk_personal_term_user FOREIGN KEY(owner_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS personal_schedule_history (
    owner_id BIGINT NOT NULL, revision INT NOT NULL, first_monday DATE NOT NULL,
    semester VARCHAR(100) NOT NULL, action VARCHAR(30) NOT NULL, reason VARCHAR(500) NOT NULL,
    snapshot_json MEDIUMTEXT NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(owner_id,revision),
    CONSTRAINT fk_personal_history_user FOREIGN KEY(owner_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS material_command_receipts (
    owner_id BIGINT NOT NULL,
    school_id BIGINT NOT NULL,
    request_id CHAR(36) NOT NULL,
    kind VARCHAR(40) NOT NULL,
    payload_sha256 CHAR(64) NOT NULL,
    result_json MEDIUMTEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(owner_id, request_id),
    CONSTRAINT fk_material_receipt_user FOREIGN KEY(owner_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS private_material_quota(id INT PRIMARY KEY);
INSERT INTO private_material_quota(id) SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM private_material_quota WHERE id=1);
CREATE TABLE IF NOT EXISTS private_material_files (
    id CHAR(36) PRIMARY KEY, owner_id BIGINT NOT NULL, school_id BIGINT NOT NULL,
    request_id CHAR(36) NOT NULL, name VARCHAR(180) NOT NULL, byte_size BIGINT NOT NULL,
    sha256 CHAR(64) NOT NULL, text_sha256 CHAR(64) NOT NULL, extracted_text MEDIUMTEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_private_file_request(owner_id,request_id),
    INDEX idx_private_file_owner(owner_id,school_id,created_at),
    CONSTRAINT fk_private_file_user FOREIGN KEY(owner_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS student_projects (
    id CHAR(36) PRIMARY KEY,
    user_id BIGINT NOT NULL,
    title VARCHAR(100) NOT NULL,
    track VARCHAR(20) NOT NULL,
    revision INT NOT NULL DEFAULT 1,
    archived BOOLEAN NOT NULL DEFAULT FALSE,
    content_json MEDIUMTEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_student_project_owner (user_id, updated_at),
    CONSTRAINT fk_student_project_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS student_project_versions (
    project_id CHAR(36) NOT NULL,
    revision INT NOT NULL,
    content_json MEDIUMTEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(project_id, revision),
    CONSTRAINT fk_student_project_version FOREIGN KEY (project_id) REFERENCES student_projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS project_reviews (
    id CHAR(36) PRIMARY KEY,
    project_id CHAR(36) NOT NULL,
    owner_id BIGINT NOT NULL,
    recipient_id BIGINT NOT NULL,
    revision INT NOT NULL,
    includes_material BOOLEAN NOT NULL DEFAULT FALSE,
    includes_data BOOLEAN NOT NULL DEFAULT FALSE,
    title VARCHAR(100) NOT NULL,
    snapshot_json MEDIUMTEXT NOT NULL,
    review_note VARCHAR(2000) NOT NULL DEFAULT '',
    reviewed_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    revoked_at DATETIME NULL,
    INDEX idx_project_review_recipient (recipient_id, expires_at),
    INDEX idx_project_review_owner (owner_id, project_id),
    CONSTRAINT fk_project_review_project FOREIGN KEY (project_id) REFERENCES student_projects(id) ON DELETE CASCADE,
    CONSTRAINT fk_project_review_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_project_review_recipient FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ai_token_reservations (
    id CHAR(36) PRIMARY KEY,
    user_id BIGINT NOT NULL,
    usage_date DATE NOT NULL,
    reserved_tokens INT NOT NULL,
    actual_tokens INT NULL,
    state VARCHAR(16) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_token_reservation_owner (user_id,created_at),
    CONSTRAINT fk_token_reservation_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS campus_wall_entries (
    id CHAR(36) PRIMARY KEY,
    school_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    parent_id CHAR(36) NULL,
    category VARCHAR(20) NOT NULL,
    title VARCHAR(100) NOT NULL,
    body TEXT NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    revision INT NOT NULL DEFAULT 1,
    review_note VARCHAR(300) NOT NULL DEFAULT '',
    reviewer_id BIGINT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_wall_school (school_id, status, created_at),
    INDEX idx_wall_owner (user_id, created_at),
    INDEX idx_wall_parent (parent_id, status),
    CONSTRAINT fk_wall_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
    CONSTRAINT fk_wall_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_wall_parent FOREIGN KEY (parent_id) REFERENCES campus_wall_entries(id) ON DELETE CASCADE,
    CONSTRAINT fk_wall_reviewer FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS campus_wall_likes (
    entry_id CHAR(36) NOT NULL,
    user_id BIGINT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (entry_id, user_id),
    CONSTRAINT fk_wall_like_entry FOREIGN KEY (entry_id) REFERENCES campus_wall_entries(id) ON DELETE CASCADE,
    CONSTRAINT fk_wall_like_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS campus_wall_reports (
    entry_id CHAR(36) NOT NULL,
    user_id BIGINT NOT NULL,
    reason VARCHAR(32) NOT NULL,
    resolved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (entry_id, user_id),
    CONSTRAINT fk_wall_report_entry FOREIGN KEY (entry_id) REFERENCES campus_wall_entries(id) ON DELETE CASCADE,
    CONSTRAINT fk_wall_report_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
-- Platform accounting contains no user identifiers or conversation content.
CREATE TABLE IF NOT EXISTS ai_spend_buckets (
    period_key VARCHAR(16) NOT NULL PRIMARY KEY,
    charged_cny DECIMAL(18,6) NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS ai_provider_attempts (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    usage_date DATE NOT NULL,
    provider VARCHAR(24) NOT NULL,
    requested_model VARCHAR(120) NOT NULL,
    response_model VARCHAR(120),
    state VARCHAR(16) NOT NULL,
    reserved_cny DECIMAL(18,6) NOT NULL,
    charged_cny DECIMAL(18,6) NOT NULL,
    estimated_cny DECIMAL(18,6),
    input_rate DECIMAL(18,6) NOT NULL,
    output_rate DECIMAL(18,6) NOT NULL,
    prompt_tokens BIGINT,
    completion_tokens BIGINT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finished_at TIMESTAMP NULL,
    INDEX idx_provider_attempts_date (usage_date)
);
