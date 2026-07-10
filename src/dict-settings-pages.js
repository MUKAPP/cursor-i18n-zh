/**
 * Settings 七大页面补全字典（Cursor 3.10+）
 * ①账号 ②外观 ③套餐与用量 ④智能体 ⑤工作树 ⑥工具与MCP ⑦钩子
 */
const settingsPagesDict = {
  // ── ① 账号 Profile ──
  'Create your public profile': '创建你的公开资料',
  'Create Profile': '创建资料',
  'Public profile': '公开资料',
  'Public Profile': '公开资料',
  'Claim handle': '认领用户名',
  'Claim your handle': '认领你的用户名',
  'Claim a handle to get a profile page showing your token, model, and agent usage.':
    '认领用户名以获取资料页，展示你的 Token、模型和智能体用量。',
  'Claim a handle before making your profile public.':
    '公开资料前请先认领用户名。',
  'Claim a handle and add your first and last name before making your profile public.':
    '公开资料前请先认领用户名并填写姓名。',
  'A public profile for how you build. Showing your token, model, and agent usage.':
    '展示你构建方式的公开资料，显示 Token、模型和智能体用量。',
  'Add links people should see on your Cursor profile.':
    '添加希望展示在 Cursor 资料上的链接。',
  'Profile picture URL (optional)': '头像 URL（可选）',
  'Change profile photo': '更换头像',
  'Sign in to view and edit your profile.': '登录以查看和编辑你的资料。',
  Public: '公开',

  // ── ② 外观 Appearance（补全）──
  Motion: '动效',
  'Reduce Motion': '减少动效',
  'Minimize interface animations. System follows your OS preference.':
    '减少界面动画。跟随系统时将遵循操作系统偏好。',
  'Hide Email Address': '隐藏邮箱地址',
  'Partially mask your email address in the Cursor user interface.':
    '在 Cursor 界面中部分隐藏你的邮箱地址。',

  // ── ③ 套餐与用量 Plan & Usage ──
  'Current Plan': '当前套餐',
  'Upgrade Available': '可升级',
  'Included in Pro+': 'Pro+ 包含',
  'Included in Pro': 'Pro 包含',
  'Included in Ultra': 'Ultra 包含',
  Total: '总计',
  'Auto + Composer': '自动 + Composer',
  API: 'API',
  'On-Demand Usage': '按需用量',
  'On-Demand Spending': '按需消费',
  'On-demand spending is currently disabled': '按需消费当前已禁用',
  'Monthly Limit': '每月上限',
  'Set a fixed amount or make it unlimited.': '设置固定额度或设为无限制。',
  'Get maximum value with 20x usage limits and early access to advanced features.':
    '获得 20 倍用量额度和高级功能抢先体验，实现最大价值。',
  'Your plan includes at least $70 of API usage.':
    '你的套餐至少包含 $70 的 API 用量。',
  'Your plan includes at least $400 of API usage.':
    '你的套餐至少包含 $400 的 API 用量。',
  'Additional usage consumes API quota.': '超出部分将消耗 API 额度。',
  'Additional usage beyond limits consumes on-demand spend.':
    '超出限制的额外用量将计入按需消费。',
  'Resets on ': '重置于 ',
  ' days)': ' 天）',
  Unlimited: '无限制',
  Disabled: '已禁用',
  Enabled: '已启用',

  // ── ④ 智能体 Agents（补全）──
  'Code Block Word Wrap': '代码块自动换行',
  'Wrap long lines in Agent chat code blocks.': '在智能体聊天代码块中自动换行长行。',
  Tips: '提示',
  'Show rotating tips on the empty screen.': '在空白界面显示轮播提示。',
  'Open Agents Window on Startup': '启动时打开智能体窗口',
  'Open the Agents Window by default when Cursor launches.':
    'Cursor 启动时默认打开智能体窗口。',
  'Remote Control': '远程控制',
  'Allow agents on this machine to be controlled remotely from mobile and web.':
    '允许从移动端和网页远程控制本机上的智能体。',
  'Keep this computer awake': '保持电脑唤醒',
  'Prevent sleep when this computer is plugged in and Remote Control is enabled.':
    '启用远程控制且电脑接通电源时，防止进入睡眠。',
  Subagents: '子智能体',
  'Explore subagent model': 'Explore 子智能体模型',
  'The Explore subagent is used to do initial research for the main agent.':
    'Explore 子智能体用于为主智能体做初步调研。',
  'Run Mode': '运行模式',
  'Approvals & Execution': '审批与执行',
  'Approvals & Execution for commands, MCP and more': '命令、MCP 等的审批与执行',
  'Choose how Agents run tools like command execution, MCP, and file writes.':
    '选择智能体如何运行命令执行、MCP 和文件写入等工具。',
  'Allow Agent to switch modes without asking first, such as Agent to Plan or Agent to Debug. When off, Cursor asks before switching.':
    '允许智能体无需确认即切换模式（如智能体→规划或智能体→调试）。关闭时，切换前会询问。',
  'Auto-Approve Mode Transitions': '自动批准模式切换',

  // ── ⑤ 工作树 Worktrees ──
  Cleanup: '清理',
  'Cursor periodically removes old worktrees to free disk space. Tune how aggressively cleanup runs.':
    'Cursor 会定期删除旧工作树以释放磁盘空间。可调整清理强度。',
  'Cursor-managed worktrees': 'Cursor 管理的工作树',
  'Max worktrees': '最大工作树数',
  'Maximum number of Cursor-managed worktrees to retain across all workspaces. Older worktrees are removed first.':
    '所有工作区中保留的 Cursor 管理工作树最大数量。优先删除较旧的工作树。',
  'Max total size (GB)': '最大总大小（GB）',
  'Maximum total size in GB across all Cursor-managed worktrees. Set to 0 to disable the size limit.':
    '所有 Cursor 管理工作树的最大总大小（GB）。设为 0 表示不限制大小。',
  'No Cursor-managed worktrees on this machine.': '本机暂无 Cursor 管理的工作树。',
  Worktree: '工作树',
  'New Worktree': '新建工作树',
  'New worktree': '新建工作树',

  // ── ⑥ 工具与 MCP ──
  Authentication: '认证',
  'Wait for MCP Authentication': '等待 MCP 认证',
  'Wait indefinitely to authenticate when prompted. When off, skip authentication prompts after 30 seconds.':
    '提示认证时无限等待。关闭后，30 秒后跳过认证提示。',
  'Browser Automation': '浏览器自动化',
  'Connected to Browser Tab': '已连接到浏览器标签页',
  'Open Web Links in Browser': '在浏览器中打开网页链接',
  'Automatically open http and https links in the Browser Tab':
    '自动在浏览器标签页中打开 http 和 https 链接。',
  'Manage View': '管理视图',
  'Servers available from Home.': '从主页可用的服务器。',
  'Team MCP Servers': '团队 MCP 服务器',
  'Plugin MCP Servers': '插件 MCP 服务器',
  'No Team MCP Servers': '暂无团队 MCP 服务器',
  'Configure Team MCP Servers': '配置团队 MCP 服务器',
  'Configured in the dashboard': '在控制台中配置',
  'Configure MCP servers in the dashboard to make them available in Cursor on desktop and in the cloud.':
    '在控制台配置 MCP 服务器，使其在桌面端和云端 Cursor 中可用。',
  'Open Customize': '打开 Customize',
  'Customize is the new home for managing this page':
    'Customize 是管理此页面的新入口',
  ' tools enabled': ' 个工具已启用',

  // ── 长句 / 模板 / 内嵌文案补全 ──
  'Remote Control runs on a cloud agent, which requires data storage that your current privacy mode disables':
    '远程控制运行在云端智能体上，当前隐私模式禁用了所需的数据存储',
  'Turn on Remote Control to keep this computer awake':
    '开启远程控制以保持电脑唤醒',
  'Prevent sleep when this computer is plugged in and Remote Control is enabled':
    '启用远程控制且电脑接通电源时，防止进入睡眠',
  'Remote Control Agent': '远程控制智能体',
  'Remote Control will be ready once its agent worker registers.':
    '远程控制将在其智能体工作进程注册后就绪。',
  'Connecting to ${il}. Remote Control will be ready once its agent worker registers.':
    '正在连接到 ${il}。远程控制将在其智能体工作进程注册后就绪。',
  'Go to your remote machine. Remote Control will be ready once its agent worker registers.':
    '请前往你的远程机器。远程控制将在其智能体工作进程注册后就绪。',
  'Sets the Run Mode to "Auto-review", which automatically approves low-risk command execution in Auto mode.':
    '将运行模式设为「自动审查」，在自动模式下自动批准低风险命令执行。',
  'Sets the Run Mode to "Auto-review", which automatically approves low-risk commands.':
    '将运行模式设为「自动审查」，自动批准低风险命令。',
  'Enabled by Run Everything Auto-Run Mode: Agent bypasses approval prompts for tools including Web Search, MCP, and terminal commands.':
    '已由「全部自动运行」模式启用：智能体可绕过包括网页搜索、MCP 和终端命令在内的工具审批提示。',
  'Enabled by Run Everything Auto-Run Mode: Agent bypasses approval prompts for tools including Web Search.':
    '已由「全部自动运行」模式启用：智能体可绕过包括网页搜索在内的工具审批提示。',
  'Enabled by Run Everything Auto-Run Mode.':
    '已由「全部自动运行」模式启用。',
  'Run Mode Disabled by Team Admin': '运行模式已被团队管理员禁用',
  'Run Mode Controlled by Team Admin (Sandbox Enabled)': '运行模式由团队管理员控制（沙箱已启用）',
  'Run Mode Controlled by Team Admin': '运行模式由团队管理员控制',
  'Enable on-demand usage to pay for extra requests beyond your plan limits.':
    '启用按需用量，为超出套餐限制的额外请求付费。',
  'Additional usage beyond limits consumes API quota or on-demand spend.':
    '超出限制的额外用量将消耗 API 额度或按需消费。',

  // ── ⑦ 钩子 Hooks ──
  'Configured Hooks': '已配置的钩子',
  'Open user config': '打开用户配置',
  'Add a hooks.json file to your user, project, or enterprise config to start running custom scripts.':
    '在用户、项目或企业配置中添加 hooks.json 文件，以开始运行自定义脚本。',
  'Hooks run custom scripts at lifecycle events to observe, control, and extend the agent loop.':
    '钩子在生命周期事件运行自定义脚本，以观察、控制和扩展智能体循环。',
  'View Hooks': '查看钩子',
  'Execution Log': '执行日志',
  'Clear log': '清空日志',
};

module.exports = { settingsPagesDict };
