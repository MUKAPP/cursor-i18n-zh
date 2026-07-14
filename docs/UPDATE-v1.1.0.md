# v1.1.0 更新指南 — 七大 Settings 页面汉化

本文档记录本次汉化补全的**全部步骤**，便于你在本地验证后推送到 GitHub。

---

## 一、本次改了什么

### 新增文件

| 文件 | 作用 |
|------|------|
| `src/dict-settings-pages.js` | 七大 Settings 页面专用翻译字典（约 120+ 词条） |

### 修改文件

| 文件 | 变更 |
|------|------|
| `src/dict.js` | 合并 `settingsPagesDict` |
| `src/tricky.js` | 增加 JSX/HTML 片段、套餐页、Customize 横幅等正则 |
| `scripts/audit.js` | 增加 7 页优先词条自检 |
| `index.js` / `package.json` | 版本号 → **1.1.0** |
| `README.md` | 功能说明与更新日志 |

### 覆盖的 7 个页面

1. **账号** — Create your public profile、Claim handle
2. **外观** — Motion、Reduce Motion、Hide Email Address
3. **套餐与用量** — Current Plan、Upgrade Available、On-Demand Usage、Included in Pro+
4. **智能体** — Code Block Word Wrap、Remote Control、Subagents、Run Mode
5. **工作树** — Cleanup、Max worktrees、Max total size
6. **工具与 MCP** — Authentication、Browser Automation、Team MCP Servers、Customize 横幅
7. **钩子** — Configured Hooks、Open user config、hooks.json 提示

---

## 二、本地验证步骤（推送 GitHub 前）

### 步骤 1：进入项目目录

```bash
cd ~/Projects/cursor-i18n-zh
```

### 步骤 2：运行覆盖率自检

```bash
npm run audit
```

期望输出：

```
优先词条遗漏: 0
优先词条已全部覆盖 ✅
```

### 步骤 3：完全退出 Cursor

macOS 使用 **Cmd + Q**；Linux 和 Windows 请退出所有 Cursor 进程。

### 步骤 4：应用汉化

```bash
node index.js localize
```

- 系统目录不可写时，当前版本会安全停止，不会提升整个 CLI 的权限
- 不要以 `sudo` 运行整个工具，以免用户配置和备份写入错误目录

### 步骤 5：重启 Cursor 并逐页检查

打开 **Cursor Settings**，依次检查上述 7 个页面是否已中文化。

### 步骤 6（可选）：查看汉化状态

```bash
node index.js status
```

应显示 `v1.1.0` 与当前 Cursor 版本。

### 步骤 7（可选）：恢复英文

```bash
node index.js restore
```

---

## 三、推送到 GitHub 步骤

在本地验证满意后：

```bash
cd ~/Projects/cursor-i18n-zh

git status
git add src/dict-settings-pages.js src/dict.js src/tricky.js scripts/audit.js index.js package.json README.md docs/UPDATE-v1.1.0.md

git commit -m "$(cat <<'EOF'
feat: v1.1.0 补全 Settings 七大页面汉化

新增 dict-settings-pages.js，覆盖账号/外观/套餐/智能体/工作树/MCP/钩子页面，
扩展 tricky.js 处理 JSX 片段与套餐页模板，audit 优先词条 0 遗漏。
EOF
)"

git push origin main
```

> 若使用其他分支名，将 `main` 替换为实际分支。

---

## 四、Cursor 更新后的维护流程

1. Cursor 大版本更新后界面可能恢复英文
2. 完全退出 Cursor
3. `git pull` 拉取最新汉化包（若从 GitHub 克隆）
4. `node index.js localize`
5. 重启 Cursor
6. 若 audit 有遗漏，在 `dict-settings-pages.js` 或 `tricky.js` 补词条后重复上述流程

---

## 五、仍可能保留英文的内容（正常）

- 服务端动态下发的套餐价格、用量百分比模板
- 品牌名：GitHub、MCP、Composer、Customize、Pro+、Ultra 等
- 部分 `[NEW]` 标签与新功能描述（随 Cursor 版本变化）

---

## 六、文件修改清单（供 Code Review）

```
src/dict-settings-pages.js   ← 新增
src/dict.js                  ← +1 行 merge
src/tricky.js                ← +10 条正则
scripts/audit.js             ← +20 条优先词条
index.js                     ← VERSION 1.1.0
package.json                 ← version 1.1.0
README.md                    ← 功能表 + 更新日志
docs/UPDATE-v1.1.0.md        ← 本文档
```
