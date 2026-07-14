#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const {
  ensureBackup,
  restoreFromBackup,
  hasBackup,
  getBackupDir,
} = require('./src/backup');
const { parseCommandLine } = require('./src/cli');
const { fixProductHashes } = require('./src/hash');
const {
  detectCursorPath,
  readCursorVersion,
  detectCursorProcesses,
  needsElevation,
  isRoot,
  prepareAppForWrite,
  readState,
  writeState,
  isStateForInstallation,
  PLATFORM,
} = require('./src/platform');
const { translateFile, fixMacGatekeeper } = require('./src/translate');
const { configureLocale, readLocaleConfiguration } = require('./src/locale');

const VERSION = '1.1.0';

function printHelp() {
  console.log(`
Cursor 界面汉化工具 v${VERSION}

用法:
  node index.js localize [--app-path <路径>]   一键汉化（Settings + Glass + Agent）
  node index.js restore [--app-path <路径>]    恢复英文原版
  node index.js status [--app-path <路径>]     查看当前状态
  node index.js locale                         仅配置 VS Code 中文语言包
  node index.js help                           显示帮助

说明:
  - 汉化前请先完全退出 Cursor
  - 可通过 --app-path 或 CURSOR_APP_PATH 指定 resources/app 目录
  - 系统安装目录的安全提权流程将在后续版本提供
  - 不要使用 sudo 或管理员身份运行整个工具
  - Cursor 更新后需重新运行 localize
`);
}

function requireCursorPaths(options = {}) {
  const paths = detectCursorPath({ appPath: options.appPath });
  if (!paths) {
    throw new Error(
      '未找到 Cursor 安装目录。请确认 Cursor 已安装，或使用 --app-path 指定 resources/app 目录。'
    );
  }
  return paths;
}

function ensureNotRunning(paths) {
  const processResult = detectCursorProcesses(paths);
  if (processResult.status === 'running') {
    const processIds = processResult.processes
      .map((processInfo) => processInfo.pid)
      .filter(Boolean)
      .join(', ');
    const processHint = processIds ? `（PID: ${processIds}）` : '';
    throw new Error(`检测到 Cursor 仍在运行${processHint}。请完全退出 Cursor 后重试。`);
  }

  if (processResult.status === 'unknown') {
    throw new Error(
      `无法确认 Cursor 是否仍在运行：${processResult.reason || '未知原因'}。为避免损坏文件，本次操作已停止。`
    );
  }
}

function formatProcessStatus(processResult) {
  if (processResult.status === 'running') return '是';
  if (processResult.status === 'not-running') return '否';
  return `未知（${processResult.reason || '检测失败'}）`;
}

function cmdStatus(options = {}) {
  const paths = requireCursorPaths(options);
  const version = readCursorVersion(paths.appPath);
  const state = readState();
  const stateMatchesInstallation = isStateForInstallation(state, paths.appPath);
  const processResult = detectCursorProcesses(paths);

  console.log('\nCursor 汉化状态\n');
  console.log(`  Cursor 版本: ${version}`);
  console.log(`  安装路径:   ${paths.appPath}`);
  console.log(`  路径来源:   ${paths.source}`);
  console.log(`  平台:       ${PLATFORM}`);
  console.log(`  当前用户:   ${isRoot() ? 'root' : process.env.USER || 'unknown'}`);
  console.log(`  Cursor 运行: ${formatProcessStatus(processResult)}`);

  if (stateMatchesInstallation && state.localizedVersion) {
    const outdated = state.localizedVersion !== version;
    console.log(`  上次汉化:   v${state.localizedVersion}${outdated ? ' ⚠️ 版本已更新，建议重新汉化' : ' ✅'}`);
    if (state.localizedAt) console.log(`  汉化时间:   ${state.localizedAt}`);
  } else {
    console.log('  上次汉化:   未汉化');
    if (state.localizedVersion && !stateMatchesInstallation) {
      console.log('  状态说明:   已忽略其他 Cursor 安装的汉化记录');
    }
  }

  console.log(`\n  备份目录:   ${getBackupDir(version)}`);
  console.log('\n  文件备份状态:');
  for (const t of paths.targets) {
    const ok = hasBackup(t.abs, version);
    console.log(`    ${path.basename(t.rel)}: ${ok ? '✅ 有备份' : '— 无备份'} (${t.label})`);
  }

  const localeConfiguration = readLocaleConfiguration();
  console.log(`\n  locale.json: ${localeConfiguration.localePath}`);
  console.log(`  VS Code 语言: ${localeConfiguration.locale || '未设置'}`);

  console.log('');
}

function cmdLocale() {
  console.log('\n配置 VS Code 中文语言包...\n');
  const results = configureLocale();
  for (const result of results) {
    if (result.hint) console.log(`  ${result.hint}`);
    if (result.localePath) {
      console.log(`  locale.json -> ${result.localePath} (${result.locale})`);
    }
  }
  console.log('\n请重启 Cursor 使 VS Code 基础界面生效。\n');
}

function cmdLocalize(options = {}) {
  const paths = requireCursorPaths(options);
  ensureNotRunning(paths);
  const version = readCursorVersion(paths.appPath);
  const writableFiles = [paths.productJsonPath, ...paths.targets.map((t) => t.abs)];

  console.log('\n🚀 Cursor 界面汉化');
  console.log(`   版本: ${version}`);
  console.log(`   路径: ${paths.appPath}`);
  console.log(`   备份: ${getBackupDir(version)}\n`);

  prepareAppForWrite(paths.appBundlePath, writableFiles);

  // 1. 配置 VS Code 语言包
  console.log('📦 步骤 1/4: 配置 VS Code 中文语言包');
  cmdLocale();

  // 2. 备份（存到用户目录，避免 .app 内写文件被 macOS 拦截）
  console.log('💾 步骤 2/4: 备份原始文件');
  for (const f of writableFiles) {
    if (!fs.existsSync(f)) continue;
    try {
      const result = ensureBackup(f, version);
      if (result) {
        const msg = result.action === 'created-backup' ? '已备份' : '已从备份还原到干净状态';
        console.log(`  ✅ ${path.basename(f)}: ${msg}`);
        console.log(`     → ${result.path}`);
      }
    } catch (e) {
      console.error(`  ❌ ${path.basename(f)} 备份失败: ${e.message}`);
      process.exit(1);
    }
  }

  // 3. 翻译
  console.log('\n⚙️ 步骤 3/4: 应用中文翻译');
  const hashTargets = [];
  for (const t of paths.targets) {
    if (!fs.existsSync(t.abs)) {
      console.log(`  ⚠️ 跳过（文件不存在）: ${t.rel}`);
      continue;
    }
    try {
      const { changed } = translateFile(t.abs);
      console.log(`  ${changed ? '✅' : 'ℹ️'} ${path.basename(t.rel)} (${t.label})${changed ? '' : ' — 无变更'}`);
      if (t.hashKey) hashTargets.push({ hashKey: t.hashKey, abs: t.abs });
    } catch (e) {
      console.error(`  ❌ ${path.basename(t.rel)} 翻译失败: ${e.message}`);
      process.exit(1);
    }
  }

  // 4. Hash + 签名
  console.log('\n🛠️ 步骤 4/4: 修复完整性校验');
  try {
    const fixed = fixProductHashes(paths.productJsonPath, hashTargets);
    if (fixed.length > 0) {
      console.log(`  ✅ 已更新 product.json 校验: ${fixed.join(', ')}`);
    } else {
      console.log('  ℹ️ 无需更新校验值');
    }
  } catch (e) {
    console.error(`  ❌ 校验修复失败: ${e.message}`);
    process.exit(1);
  }

  if (PLATFORM === 'darwin') {
    fixMacGatekeeper(paths.appBundlePath);
  }

  writeState({
    localizedVersion: version,
    localizedAt: new Date().toISOString(),
    appPath: paths.appPath,
  });

  console.log('\n🎉 汉化完成！请重启 Cursor 查看中文界面。');
  console.log('   若 Cursor 更新后界面恢复英文，请重新运行: node index.js localize\n');
}

function cmdRestore(options = {}) {
  const paths = requireCursorPaths(options);
  ensureNotRunning(paths);
  const version = readCursorVersion(paths.appPath);
  const writableFiles = [paths.productJsonPath, ...paths.targets.map((t) => t.abs)];

  prepareAppForWrite(paths.appBundlePath, writableFiles);

  console.log('\n⏪ 恢复英文原版...\n');
  let restored = 0;

  for (const f of writableFiles) {
    if (restoreFromBackup(f, version)) {
      console.log(`  ✅ 已还原: ${path.basename(f)}`);
      restored++;
    }
  }

  if (restored > 0) {
    const hashTargets = paths.targets.filter((t) => t.hashKey).map((t) => ({ hashKey: t.hashKey, abs: t.abs }));
    fixProductHashes(paths.productJsonPath, hashTargets);
    if (PLATFORM === 'darwin') fixMacGatekeeper(paths.appBundlePath);
    const currentState = readState();
    if (isStateForInstallation(currentState, paths.appPath)) {
      writeState({
        ...currentState,
        localizedVersion: null,
        restoredAt: new Date().toISOString(),
      });
    }
    console.log('\n🎉 已恢复英文原版！请重启 Cursor。\n');
  } else {
    console.log('\n⚠️ 未找到备份文件。请先执行 localize 创建备份。\n');
  }
}

async function main() {
  const options = parseCommandLine(process.argv.slice(2));
  const { command } = options;

  if (command === 'help') {
    printHelp();
    return;
  }

  if (command === 'status') {
    cmdStatus(options);
    return;
  }

  if (isRoot()) {
    throw new Error(
      '请勿使用 sudo、root 或管理员身份运行写入命令，以免备份和用户配置写入错误的用户目录。'
    );
  }

  if (command === 'locale') {
    cmdLocale();
    return;
  }

  if (command === 'localize' || command === 'restore') {
    const paths = requireCursorPaths(options);

    if (needsElevation(paths)) {
      throw new Error(
        'Cursor 安装目录不可写。当前版本不会提升整个 CLI 的权限；请等待受限安装 helper，或使用可写的 Cursor 安装目录。'
      );
    }

    if (command === 'localize') cmdLocalize(options);
    else cmdRestore(options);
    return;
  }
}

main().catch((e) => {
  console.error('错误:', e.message);
  process.exit(1);
});
