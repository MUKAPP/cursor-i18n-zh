# cursor-i18n-zh

Cursor IDE 界面一键汉化工具 — 将 Cursor 专有英文界面替换为简体中文。

> 非官方工具，与 Cursor 团队无关。修改的是本地安装包，请自行评估风险。

## 功能覆盖

| 区域 | 说明 |
|------|------|
| **Cursor Settings** | General、Account、Appearance、Plan & Usage、Agents、Worktree、Tools & MCP、Hooks 等 |
| **Glass 主页** | New Agent、Automations、Plan New Idea 等 |
| **Automations** | 自动化列表、模板、触发器、MCP 等 |
| **Appearance** | 主题、颜色、字体排版、工具调用密度 |
| **Agent 聊天** | 常用操作按钮与提示文案 |
| **VS Code 基础 UI** | 通过中文语言包汉化 File / Edit / 命令面板等 |

## 环境要求

- **Node.js** ≥ 18
- **Cursor IDE**（macOS / Windows / Linux）
- 系统安装目录不可写时，工具会安全停止，不会提升整个 CLI 的权限
- Linux 已识别 `/usr/share/cursor/resources/app`、`/usr/lib/cursor/resources/app`、`/opt/Cursor/resources/app` 和用户目录安装

## 快速开始

```bash
# 克隆仓库
git clone https://github.com/baishi1114010/cursor-i18n-zh.git
cd cursor-i18n-zh

# 无需 npm install（零依赖）

# 1. 完全退出 Cursor（macOS: Cmd+Q；Linux/Windows: 退出所有 Cursor 进程）

# 2. 一键汉化
node index.js localize

# 3. 重启 Cursor
```

## 命令说明

| 命令 | 作用 |
|------|------|
| `node index.js localize` | 一键汉化（含 VS Code 语言包配置） |
| `node index.js restore` | 恢复英文原版 |
| `node index.js status` | 查看汉化状态与 Cursor 版本 |
| `node index.js locale` | 仅配置 VS Code 中文语言包 |
| `node index.js help` | 显示帮助 |

如果自动检测不到安装位置，可以显式指定 `resources/app` 目录：

```bash
node index.js status --app-path /usr/share/cursor/resources/app
node index.js localize --app-path /usr/share/cursor/resources/app

# 也可以使用环境变量
CURSOR_APP_PATH=/usr/share/cursor/resources/app node index.js status
```

也可使用 npm scripts：

```bash
npm run localize
npm run restore
npm run status
npm run audit
npm test
```

## 工作原理

```
┌─────────────────────────────────────────────────────────┐
│                    cursor-i18n-zh                        │
├─────────────────────────────────────────────────────────┤
│  1. 检测 Cursor 安装路径与版本                           │
│  2. 配置 VS Code 中文语言包（locale.json）               │
│  3. 备份原始文件 → ~/.cursor-i18n-zh/backups/<版本>/     │
│  4. 按字典对 JS 打包文件做安全字符串替换                 │
│  5. 修复 product.json 完整性校验 Hash                    │
│  6. macOS: 清除隔离属性 + 本地重签名                     │
└─────────────────────────────────────────────────────────┘
```

### 汉化的目标文件

| 文件 | 内容 |
|------|------|
| `workbench.desktop.main.js` | Settings、Agent 聊天等 |
| `workbench.glass.main.js` | Glass 主页、Appearance 等 |
| `workbench.anysphere-ui-automations.js` | Automations 页面 |
| `product.json` | 校验 Hash 修复 |

### 翻译引擎

字典分三类，避免误替换导致白屏：

1. **安全长句**（`dict.js` 等）：在引号内全局替换，如 `"Privacy Mode"` → `"隐私模式"`
2. **危险短词**（`riskyShortWords`）：仅在 `label:`、`description:` 等 UI 属性中替换
3. **特殊规则**（`tricky.js`、`settings-nav.js`）：三元表达式、Settings 导航映射等

### 备份机制

- 备份存放在用户目录，**不在** `.app` 包内（避免 macOS EPERM）
- 路径：`~/.cursor-i18n-zh/backups/<Cursor版本>/`
- 状态记录：`~/.cursor-i18n-zh/state.json`

### Linux 用户配置

- 显示语言仅写入 `${XDG_CONFIG_HOME:-$HOME/.config}/Cursor/User/locale.json`
- 工具不会修改 `settings.json`，因此不会破坏其中的 JSONC 注释、尾逗号或用户设置
- `status` 只读取状态和备份，不会为了查询而创建备份目录

## 项目结构

```
cursor-i18n-zh/
├── AGENTS.md                # AI 编程代理协作规则
├── index.js                 # CLI 入口
├── package.json
├── scripts/
│   └── audit.js             # 覆盖率自检
├── test/                    # Node.js 内置测试
└── src/
    ├── cli.js               # 命令行参数解析
    ├── user-context.js      # 跨平台用户目录解析
    ├── platform.js          # 路径检测、提权、运行状态
    ├── backup.js            # 外部目录备份/还原
    ├── hash.js              # product.json 校验修复
    ├── translate.js         # 核心翻译引擎
    ├── locale.js            # VS Code 语言包配置
    ├── tricky.js            # 特殊格式正则替换
    ├── settings-nav.js      # Settings 侧栏导航映射
    ├── dict.js              # 主翻译字典
    ├── dict-automations.js  # Automations 专用字典
    ├── dict-appearance.js   # Appearance 专用字典
    └── dict-settings-pages.js # Settings 七大页面补全字典
```

## 更新日志

### v1.1.0（2026-07-10）

补全 Settings 七大页面汉化：

| 页面 | 主要补全内容 |
|------|-------------|
| 账号 | 公开资料、认领用户名 |
| 外观 | 动效、隐藏邮箱 |
| 套餐与用量 | 当前套餐、可升级、按需用量、API 用量条 |
| 智能体 | 代码块换行、远程控制、运行模式 |
| 工作树 | 清理策略、最大工作树数 |
| 工具与 MCP | 认证、浏览器自动化、团队 MCP |
| 钩子 | 已配置钩子、Customize 迁移横幅 |

```bash
npm run audit   # 优先词条 0 遗漏
```

## 常见问题

### Cursor 更新后界面变回英文？

大版本更新会覆盖修改过的文件，重新运行：

```bash
node index.js localize
```

### 权限不足 / EPERM？

1. 确保 Cursor 已完全退出。
2. 系统安装目录不可写时，当前版本会安全停止，不会提升整个 CLI 的权限。
3. 不要执行 `sudo node index.js localize`，否则备份、状态和语言配置可能进入错误的用户目录。
4. 受限权限 helper 会在后续改动中提供；当前可先运行 `status` 和 `locale`，或在可写的测试安装目录中验证。

### 如何恢复英文？

```bash
node index.js restore
```

然后重启 Cursor。

### 如何贡献翻译？

在 `src/dict.js`（或 `dict-automations.js`、`dict-appearance.js`）中添加条目：

```javascript
'English text here': '中文翻译',
```

运行 `npm test` 和 `npm run audit` 验证，然后提交 Pull Request。

## 已知限制

- 服务端动态下发的文案（部分套餐页、模板描述）无法本地汉化
- 每次 Cursor **大版本更新**后需重新汉化
- 品牌名（GitHub、Slack、MCP 等）保留英文
- 非官方方式，不在 Cursor 支持范围内
- AppImage 的挂载目录通常只读，不能直接原地修改
- 当前系统目录安装尚未启用自动提权；工具不会回退为整程序 sudo

## 许可证

[MIT](LICENSE)

## 致谢

翻译引擎思路参考社区项目 [cursor-i18n-tool](https://github.com/Wuyf5275/cursor-i18n-tool)，在本项目基础上扩展了 Glass、Automations、Appearance 等模块。
