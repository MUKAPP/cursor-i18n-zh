#!/usr/bin/env node
/**
 * 汉化覆盖率自检脚本
 * 用法: node scripts/audit.js
 */
const fs = require('fs');
const path = require('path');
const { detectCursorPath } = require('../src/platform');
const { translateContent } = require('../src/translate');

const PRIORITY_STRINGS = [
  // Settings 侧栏
  ['general:"General"', 'Settings → General'],
  ['chat:"Agents"', 'Settings → Agents'],
  ['tab:"Tab"', 'Settings → Tab'],
  ['models:"Models"', 'Settings → Models'],
  ['mcp:"Tools & MCPs"', 'Settings → Tools & MCPs'],
  ['hooks:"Hooks"', 'Settings → Hooks'],
  ['network:"Network"', 'Settings → Network'],
  ['beta:"Beta"', 'Settings → Beta'],
  // Settings 描述
  ['Show warning-level in-app toasts', '警告通知描述'],
  ['Show Cursor in menu bar', '菜单栏描述'],
  ['Open pull request links inside Cursor', 'PR 链接描述'],
  // Glass 主页
  ['"New Agent"', 'Glass → New Agent'],
  ['"Automations"', 'Glass → Automations'],
  ['"Plan New Idea"', 'Glass → Plan New Idea'],
  // Agent 常用
  ['"Learn More"', 'Learn More 按钮'],
  ['"Open Settings"', 'Open Settings 按钮'],
  ['"Start New Chat"', 'Start New Chat'],
  // Automations 页
  ['"Total Automations"', 'Automations → 总数'],
  ['"New Automation"', 'Automations → 新建'],
  ['"Run History"', 'Automations → 运行历史'],
  ['"Find critical bugs"', 'Automations → 模板'],
  ['Automate repetitive tasks', 'Automations → 副标题'],
  // Appearance 页
  ['Tool Call Density', 'Appearance → 工具调用密度'],
  ['UI Font Size', 'Appearance → 界面字体大小'],
  ['Reduce Transparency', 'Appearance → 降低透明度'],
  ['Choose between light, dark', 'Appearance → 主题描述'],
];

function auditFile(label, filePath) {
  if (!fs.existsSync(filePath)) {
    console.log(`\n⚠️  ${label}: 文件不存在`);
    return { missing: PRIORITY_STRINGS.length, total: PRIORITY_STRINGS.length };
  }

  const current = fs.readFileSync(filePath, 'utf8');
  const simulated = translateContent(current);

  console.log(`\n=== ${label} ===`);
  let missing = 0;
  for (const [needle, desc] of PRIORITY_STRINGS) {
    const stillInSim = simulated.includes(needle);
    const inCurrent = current.includes(needle);
    if (stillInSim) {
      console.log(`  ❌ ${desc}`);
      missing++;
    } else if (inCurrent) {
      console.log(`  ✅ ${desc} (补全后可达)`);
    } else {
      console.log(`  ✅ ${desc} (已汉化)`);
    }
  }
  return { missing, total: PRIORITY_STRINGS.length };
}

function main() {
  const paths = detectCursorPath();
  if (!paths) {
    console.error('未找到 Cursor 安装目录');
    process.exit(1);
  }

  console.log('Cursor 汉化覆盖率自检');
  console.log(`安装路径: ${paths.appPath}`);

  const results = [
    auditFile('desktop.main.js', paths.targets[0].abs),
    auditFile('glass.main.js', paths.targets[1].abs),
    auditFile('automations.js', paths.targets[2].abs),
  ];

  const totalMissing = results.reduce((s, r) => s + r.missing, 0);
  console.log(`\n--- 汇总 ---`);
  console.log(`优先词条遗漏: ${totalMissing}`);
  if (totalMissing > 0) {
    console.log('\n请运行: node index.js localize （需先退出 Cursor）');
  } else {
    console.log('\n优先词条已全部覆盖 ✅');
  }
}

main();
