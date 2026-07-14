# 项目协作规则

- 本项目是 Node.js 18+ 的零第三方依赖 Cursor 汉化 CLI，入口为 `index.js`。
- `src/` 存放平台、备份、语言配置和翻译逻辑；`scripts/` 存放手工审计工具；`test/` 存放 `node:test` 测试。
- 常用命令：`npm test`、`npm run check`、`npm run audit`、`node index.js status`。
- 代码标识符使用英文；注释、日志、错误信息和文档默认使用简体中文。
- 跨平台路径逻辑应支持依赖注入，并使用临时目录测试；测试不得修改真实 Cursor 安装或用户配置。
- 不要以 root 身份运行整个 CLI，也不要把备份、状态或语言配置写入提权用户的 HOME。
- 修改安装文件前必须保留备份，并确保 Cursor 已完全退出。
