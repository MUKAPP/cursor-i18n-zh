# 项目协作规则

- 本项目是 Node.js 18+ 的零第三方依赖 Cursor 汉化 CLI，入口为 `index.js`。
- `src/` 存放平台、备份、语言配置和翻译逻辑；`scripts/` 存放手工审计工具；`test/` 存放 `node:test` 测试。
- 常用命令：`npm test`、`npm run check`、`npm run audit`、`node index.js status`。
- 代码标识符使用英文；注释、日志、错误信息和文档默认使用简体中文。
- 跨平台路径逻辑应支持依赖注入，并使用临时目录测试；测试不得修改真实 Cursor 安装或用户配置。
- 不要以 root 身份运行整个 CLI，也不要把备份、状态或语言配置写入提权用户的 HOME。
- Linux 提权 helper 必须保持自包含，只接受 stdin 协议，并只允许写入固定 Cursor 系统安装路径中的允许文件。
- 修改 `src/elevated-helper.js` 后，应提醒用户按 README 重新安装 root 所有的 helper 副本。
- 修改安装文件前必须保留备份，并确保 Cursor 已完全退出。
- 备份、事务暂存、journal 和状态文件只能由普通用户进程管理，不能传给提权 helper 或写入系统安装目录。
- 事务暂存路径必须是事务目录内的相对路径；修改事务 schema、阶段转换或恢复策略时，必须补充提交失败、崩溃恢复和外部冲突测试。
- 安装文件提交前必须验证 JavaScript、JSON、文件大小和摘要；无法重现现有 checksum 的算法与编码时必须停止，不能按长度猜测。
