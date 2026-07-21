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
- Linux 系统安装目录不可写时，可通过受限 `pkexec` helper 只写固定安装文件
- Linux 已识别 `/usr/share/cursor/resources/app`、`/usr/lib/cursor/resources/app`、`/opt/Cursor/resources/app` 和用户目录安装

## 快速开始

```bash
# 克隆仓库
git clone https://github.com/baishi1114010/cursor-i18n-zh.git
cd cursor-i18n-zh

# 无需 npm install（零依赖）

# Linux 系统目录安装需要先安装受限 helper，详见下文

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

### Linux 提权 helper

Cursor 安装在 `/usr/share`、`/usr/lib` 或 `/opt` 时，普通用户通常不能直接修改安装文件。先执行一次以下命令，将自包含 helper 安装到 root 所有且普通用户不可写的位置：

```bash
sudo install -d -o root -g root -m 0755 /usr/local/libexec/cursor-i18n-zh
sudo install -o root -g root -m 0755 src/elevated-helper.js \
  /usr/local/libexec/cursor-i18n-zh/elevated-helper.js
```

helper 使用系统级 Node.js（默认 `/usr/bin/node`），并要求系统已安装 `pkexec`。

注意：提权写入不能使用 nvm、fnm 或用户目录中的 Node。若本机只有 nvm 的 Node，请先安装系统包，例如：

```bash
sudo apt update
sudo apt install -y nodejs
# 确认存在系统 Node
ls -l /usr/bin/node
```

之后仍以普通用户运行：

```bash
node index.js localize --app-path /usr/share/cursor/resources/app
```

需要写入时，系统会显示一次管理员授权窗口。提权进程只接受 stdin JSON 协议，只允许写入三个 workbench 文件和 `product.json`，不会读取用户的备份、状态、语言配置或任意路径。以下情况会直接拒绝写入：

- helper、系统 Node.js 或 `pkexec` 不是 root 所有，或可被普通用户修改；
- 安装目录不在 `/usr/share/cursor/resources/app`、`/usr/lib/cursor/resources/app`、`/opt/Cursor/resources/app`；
- 目标不是普通文件、包含符号链接、内容在提交前发生变化；
- Cursor 仍在运行，或 helper 无法确认进程状态。

不要使用 `sudo node index.js localize`。备份、状态和 `locale.json` 必须始终由普通用户进程管理。

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
│  2. 备份原始文件 → ~/.cursor-i18n-zh/backups/<版本>/     │
│  3. 翻译 JS，并按原算法和编码更新 product.json checksum  │
│  4. 验证内容并暂存事务的 before / after 文件             │
│  5. 原子提交；Linux 必要时调用受限 pkexec helper          │
│  6. 原子更新状态，并配置 VS Code 中文语言包               │
│  7. macOS: 清除隔离属性 + 本地重签名                     │
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
- 已有备份只作为原始内容来源，不会在汉化准备阶段反向覆盖当前安装文件

### 事务提交与崩溃恢复

- 待写内容先保存到 `~/.cursor-i18n-zh/transactions/<事务ID>/`，其中包含 `before/`、`after/` 和 `journal.json`
- 提交前会严格验证 UTF-8、JavaScript 语法、JSON 结构、文件大小和 SHA-256 摘要；验证 JavaScript 时只编译，不执行打包文件
- `journal.json` 使用 `prepared → committing → committed` 阶段记录提交进度，状态文件和 journal 均使用原子替换写入
- 下次执行 `localize` 或 `restore` 时会先恢复未完成事务：全量提交完成则补写状态，部分提交则回滚到事务前内容
- 如果安装文件缺失或既不符合事务前摘要也不符合事务后摘要，工具会停止，不会覆盖 Cursor 更新或其他工具的修改
- 重复执行相同操作时，如果安装文件已经处于目标状态，只更新状态而不重复写入安装目录

### Windows 写入说明

- Windows 提交安装文件时会跳过目录 `fsync`（该操作在 Windows 上常返回 `EPERM`）
- 文件内容仍会在替换前完成写入与 `fsync`，再通过 rename 原子替换
- 若仍出现 `EPERM`，请先完全退出 Cursor，并确认当前用户对安装目录有写权限

### 动态 checksum

- 工具使用修改前的原始文件字节重现 `product.json` 中现有 checksum，不再根据字符串长度猜测算法
- 支持 MD5、SHA-1、SHA-256、SHA-384、SHA-512，以及十六进制、Base64 和 Base64URL 的常见大小写与填充格式
- 单个 checksum 无法区分 Base64 与 Base64URL 时，会参考同一 `checksums` 对象中其他条目的 `+`、`/`、`-`、`_` 特征进行消歧
- 只匹配目标文件的规范相对路径；无法重现旧值、匹配到多个条目或编码格式存在歧义时会停止
- 没有对应 checksum 条目的目标文件会保留原状并在运行日志中说明

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
    ├── installation-writer.js # 安装文件统一写入与 pkexec 调用
    ├── elevated-helper.js   # Linux 受限提权写入 helper
    ├── atomic-file.js       # 用户态原子文件写入
    ├── content-validator.js # 暂存内容语法与结构验证
    ├── transaction.js       # 安装事务、journal 与崩溃恢复
    ├── backup.js            # 外部目录备份/还原
    ├── hash.js              # product.json 动态 checksum 更新
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
2. Linux 系统安装目录不可写时，先按“Linux 提权 helper”步骤完成一次性安装。
3. 不要执行 `sudo node index.js localize`，否则备份、状态和语言配置可能进入错误的用户目录。
4. 用户取消授权、helper 未安装或信任校验失败时，工具会停止且不会写入成功状态。

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
- AppImage 和自定义 root 安装路径不会使用提权 helper；工具不会回退为整程序 sudo

## 许可证

[MIT](LICENSE)

## 致谢

翻译引擎思路参考社区项目 [cursor-i18n-tool](https://github.com/Wuyf5275/cursor-i18n-tool)，在本项目基础上扩展了 Glass、Automations、Appearance 等模块。
