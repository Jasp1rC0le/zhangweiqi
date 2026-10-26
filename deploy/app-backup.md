# 数据库与私有原件的一致性快照

`app-backup.mjs` 使用 Node 内置 AES-256-GCM 为数据库、每个私有原件和清单分别加密、验证。它不依赖本机未安装的 age；**不是旧 `.age` 数据库备份的读取器**，旧工具保留。密钥文件为随机32字节的Base64，权限600/400，必须由运营方保管在备份目录之外；不要把密钥上传聊天或与备份共同外传。测试生成的临时密钥不能作为正式运营密钥。

备份要求明确批准的维护窗口：会对**指定应用库全部表**持有短时READ锁以获得数据库／文件一致视图，不使用全实例锁；其他库不被锁定。写入可能等待，正式网站必须另行安排维护，不能直接在高峰使用。应用迁移／DDL不得并行。超时或原件缺失／校验失败不会生成COMPLETE标记，残留目录只供调查。

```sh
node deploy/app-backup.mjs backup --config /private/mysql.cnf --db APPROVED_DB --materials /private/originals --out /private/backups/NEW_JOB --key /private/keys/backup.key --allow-read-lock yes
node deploy/app-backup.mjs restore --config /private/mysql-drill.cnf --db campthink_restore_UNIQUE --materials /private/NEW_RESTORED_ORIGINALS --from /private/backups/NEW_JOB --key /private/keys/backup.key
```

`--mysql` 和 `--mysqldump` 可指定已安装客户端的绝对路径。连接信息从权限受限的正常MySQL配置读取，不放入命令行密码。输出只有表数、原件数和目标路径，不输出行内容、密钥、会话令牌或账号数据。

- 快照包含应用表结构和数据、数据库引用的全部私有原件；不包含用户目录中的无引用孤儿文件、系统账号权限、应用配置和其他资产。不是整个服务器镜像。
- 保留登录／一次性令牌表结构，但排除 `auth_sessions` 与 `account_action_tokens` 的所有数据；恢复后必须重新登录，旧重置链接失效。
- 原件根据数据库的ID、字节数、SHA-256核对，只接受普通文件，不跟随符号链接；没有原件的纯数据库快照不会被当作完整备份。
- 恢复先认证全部密文与清单，再创建全新的 `campthink_restore_` 前缀库和原件目录；拒绝现有目标，不删库、不覆盖文件。失败保留隔离目标，不自动将其接到网站。
- 恢复检查精确表清单、每表行数、原件元数据与字节校验。仍须用隔离应用正常登录、下载和跨账号拒绝验收；工具成功不等于公网恢复或异地备份运营已完成。
- 本格式有5分钟执行边界、最多1000表／100000个原件、32MiB查询元数据边界。超出须在维护计划中重新评估，不盲放宽。异地副本、保留期限、密钥备份与实际取回是另外的运营验收。
