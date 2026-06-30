/**
 * Appearance（外观）设置页翻译字典
 * 主要位于 workbench.glass.main.js
 */
const appearanceDict = {
  // ── Theme ──
  Theme: '主题',
  'Theme Name': '主题名称',
  'Choose between light, dark, or high contrast themes':
    '在浅色、深色或高对比度主题之间选择',
  'Choose which theme to use': '选择要使用的主题',
  'Choose whether the theme behaves like a light or dark theme':
    '选择主题表现为浅色还是深色',
  'Choose the theme used when your system is in light mode':
    '选择系统在浅色模式下使用的主题',
  'Choose the theme used when your system is in dark mode':
    '选择系统在深色模式下使用的主题',
  'Follow System Color Scheme': '跟随系统配色方案',
  'Match the active theme to your OS dark/light setting':
    '使当前主题与操作系统深/浅色设置保持一致',
  'Manage Themes': '管理主题',
  'Create your own themes, tweak the vibe, and import your favorites':
    '创建自定义主题、调整风格并导入收藏',
  'Name shown in the theme picker': '在主题选择器中显示的名称',
  'This will remove the custom theme from your saved themes.':
    '这将从已保存的主题中移除此自定义主题。',
  'Light Theme': '浅色主题',
  'Dark Theme': '深色主题',
  'High Contrast': '高对比度',
  'Light \xB7 High contrast': '浅色 · 高对比度',
  'Dark \xB7 High contrast': '深色 · 高对比度',
  'Cursor Dark High Contrast': 'Cursor 深色高对比度',

  // ── Chat / Tool Call Density ──
  'Tool Call Density': '工具调用密度',
  'Adjust how much detail is shown for tool calls':
    '调整工具调用显示的详细程度',
  'Choose how much detail Agent tool calls show in the conversation':
    '选择智能体工具调用在对话中显示的详细程度',
  'Conversation Density': '对话密度',
  Detailed: '详细',
  Compact: '紧凑',
  'Compact Display': '紧凑显示',
  'Compact Terminal Tool Calls': '紧凑终端工具调用',
  'Show terminal commands in compact view by default':
    '默认以紧凑视图显示终端命令',
  'Controls how shell and edit-file tool calls are displayed and grouped in Glass Agent conversations.':
    '控制 Glass 智能体对话中 shell 和编辑文件工具调用的显示与分组方式。',
  'Controls how shell and edit-file tool calls are displayed and grouped in Editor Agent conversations.':
    '控制编辑器智能体对话中 shell 和编辑文件工具调用的显示与分组方式。',
  'Controls the maximum width in pixels of chat content.':
    '以像素为单位控制聊天内容的最大宽度。',
  'Controls the text size scale (relative to base 12px) of AI chat messages.':
    '控制 AI 聊天消息的文字大小比例（相对于 12px 基准）。',
  'Processing tool calls': '正在处理工具调用',
  'Tool Call': '工具调用',
  'Tool call': '工具调用',

  // ── Colors ──
  Colors: '颜色',
  Hue: '色相',
  'Choose a tint color': '选择色调',
  Intensity: '强度',
  'Control how strongly the tint is applied': '控制色调的应用强度',
  'Reduce Transparency': '降低透明度',
  'Replace translucent surfaces with opaque backgrounds':
    '将半透明表面替换为不透明背景',
  'When enabled, translucent surfaces and vibrancy effects are replaced with opaque backgrounds for improved readability.':
    '启用后，半透明表面和毛玻璃效果将被不透明背景替代，以提高可读性。',
  'Use stronger derived contrast colors': '使用更强的衍生对比色',
  'Use themed background colors for inline diffs': '为内联差异使用主题背景色',

  // ── Typography ──
  Typography: '字体排版',
  'UI Font Size': '界面字体大小',
  'Font size for the Cursor user interface': 'Cursor 用户界面的字体大小',
  'Code Font Size': '代码字体大小',
  'Font size for code editors and diffs': '代码编辑器和差异视图的字体大小',
  'UI Font Family': '界面字体',
  'Override the Cursor user interface typeface': '覆盖 Cursor 用户界面字体',
  'Code Font Family': '代码字体',
  'Override the font for code editors and diffs': '覆盖代码编辑器和差异视图的字体',
  'System font': '系统字体',
  'System monospace': '系统等宽字体',
  Monospace: '等宽字体',
  'Font Smoothing': '字体平滑',
  'Use native macOS font anti-aliasing': '使用 macOS 原生字体抗锯齿',
};

module.exports = { appearanceDict };
