#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const {
  ensureBackup,
  readBackup,
  hasBackup,
  getBackupDir,
} = require('./src/backup');
const { parseCommandLine } = require('./src/cli');
const { updateProductChecksums } = require('./src/hash');
const { applyInstallationReplacements } = require('./src/installation-writer');
const {
  commitTransaction,
  createInstallationTransaction,
  loadPendingTransactions,
  recoverTransaction,
} = require('./src/transaction');
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
const { translateContent, fixMacGatekeeper } = require('./src/translate');
const { configureLocale, readLocaleConfiguration } = require('./src/locale');

const VERSION = '1.1.0';

function calculateSha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function assertCurrentFileMatchesKnownContent(filePath, knownContents, description) {
  const currentContent = fs.readFileSync(filePath);
  const currentHash = calculateSha256(currentContent);
  const matchesKnownContent = knownContents.some(
    (knownContent) => calculateSha256(knownContent) === currentHash
  );

  if (!matchesKnownContent) {
    throw new Error(
      `${description} 与现有备份及已知汉化结果均不一致。可能存在 Cursor 更新或外部修改，本次操作已停止。`
    );
  }

  return { currentContent, currentHash };
}

function assertRequiredRestoreBackups(paths, targetBackups, productBackup) {
  const desktopTarget = paths.targets.find((target) =>
    target.rel.endsWith('workbench.desktop.main.js')
  );
  const desktopBackup = desktopTarget
    ? targetBackups.get(desktopTarget.rel)
    : null;

  if (!desktopBackup || !productBackup) {
    throw new Error(
      '恢复所需的 desktop workbench 与 product.json 关键备份不完整，本次操作已停止。'
    );
  }
}

function createTransactionWriter(paths) {
  return (replacements) =>
    applyInstallationReplacements(paths.appPath, replacements, {
      ensureNotRunning: () => ensureNotRunning(paths),
      needsElevation: needsElevation(paths),
      platform: PLATFORM,
    });
}

function recoverPendingTransactions(options = {}) {
  const pendingTransactions = loadPendingTransactions(options);
  for (const transaction of pendingTransactions) {
    const paths = requireCursorPaths({ appPath: transaction.journal.appPath });
    ensureNotRunning(paths);
    const result = recoverTransaction(transaction, {
      ...options,
      applyReplacements: createTransactionWriter(paths),
      writeFinalState: (state) => writeState(state, options),
    });
    console.log(
      `  已处理未完成事务 ${transaction.journal.transactionId}: ${result.action}`
    );
  }
}

function createPreparedFile(relativePath, contentType, beforeContent, afterContent) {
  return {
    relativePath,
    contentType,
    beforeContent: Buffer.from(beforeContent),
    afterContent: Buffer.from(afterContent),
  };
}

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
  - Linux 系统安装目录不可写时会调用受限 pkexec helper
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
  recoverPendingTransactions(options);
  const paths = requireCursorPaths(options);
  ensureNotRunning(paths);
  const version = readCursorVersion(paths.appPath);
  const writableFiles = [paths.productJsonPath, ...paths.targets.map((t) => t.abs)];

  console.log('\n🚀 Cursor 界面汉化');
  console.log(`   版本: ${version}`);
  console.log(`   路径: ${paths.appPath}`);
  console.log(`   备份: ${getBackupDir(version)}\n`);

  prepareAppForWrite(paths.appBundlePath, writableFiles);

  // 1. 备份（存到用户目录，避免 .app 内写文件被 macOS 拦截）
  console.log('💾 步骤 1/4: 备份原始文件');
  for (const f of writableFiles) {
    if (!fs.existsSync(f)) continue;
    try {
      const result = ensureBackup(f, version, options);
      if (result) {
        const msg = result.action === 'created-backup' ? '已备份' : '已保留现有备份';
        console.log(`  ✅ ${path.basename(f)}: ${msg}`);
        console.log(`     → ${result.path}`);
      }
    } catch (e) {
      console.error(`  ❌ ${path.basename(f)} 备份失败: ${e.message}`);
      process.exit(1);
    }
  }

  // 2. 翻译并准备事务内容
  console.log('\n⚙️ 步骤 2/4: 应用中文翻译');
  const preparedFiles = [];
  const modifiedJavaScriptFiles = [];
  for (const t of paths.targets) {
    if (!fs.existsSync(t.abs)) {
      console.log(`  ⚠️ 跳过（文件不存在）: ${t.rel}`);
      continue;
    }
    try {
      const backup = readBackup(t.abs, version, options);
      if (!backup) {
        throw new Error('未找到刚创建的源文件备份');
      }
      const original = backup.content.toString('utf8');
      const translated = translateContent(original);
      const changed = translated !== original;
      const verifiedCurrentFile = assertCurrentFileMatchesKnownContent(
        t.abs,
        [backup.content, Buffer.from(translated, 'utf8')],
        path.basename(t.rel)
      );
      const translatedContent = Buffer.from(translated, 'utf8');
      console.log(`  ${changed ? '✅' : 'ℹ️'} ${path.basename(t.rel)} (${t.label})${changed ? '' : ' — 无变更'}`);
      preparedFiles.push(
        createPreparedFile(
          t.rel,
          'javascript',
          verifiedCurrentFile.currentContent,
          translatedContent
        )
      );
      modifiedJavaScriptFiles.push({
        relativePath: t.rel,
        originalContent: backup.content,
        updatedContent: translatedContent,
      });
    } catch (e) {
      throw new Error(`${path.basename(t.rel)} 翻译失败: ${e.message}`);
    }
  }

  // 3. 动态 checksum 与事务提交
  console.log('\n🛠️ 步骤 3/4: 验证完整性并提交事务');
  try {
    const productBackup = readBackup(paths.productJsonPath, version, options);
    if (!productBackup) {
      throw new Error('未找到 product.json 备份');
    }
    const hashResult = updateProductChecksums(
      productBackup.content,
      modifiedJavaScriptFiles
    );
    const verifiedProductJson = assertCurrentFileMatchesKnownContent(
      paths.productJsonPath,
      [productBackup.content, hashResult.content],
      'product.json'
    );
    preparedFiles.push(
      createPreparedFile(
        'product.json',
        'json',
        verifiedProductJson.currentContent,
        hashResult.content
      )
    );
    if (hashResult.matchedChecksumKeys.length > 0) {
      console.log(
        `  ✅ 已更新 product.json 校验: ${hashResult.matchedChecksumKeys.join(', ')}`
      );
    } else {
      console.log('  ℹ️ 无需更新校验值');
    }
    if (hashResult.untrackedFiles.length > 0) {
      console.log(`  ℹ️ 无 checksum 条目: ${hashResult.untrackedFiles.join(', ')}`);
    }

    const finalState = {
      localizedVersion: version,
      localizedAt: new Date().toISOString(),
      appPath: paths.appPath,
      installationFileHashes: Object.fromEntries(
        preparedFiles.map((preparedFile) => [
          preparedFile.relativePath,
          calculateSha256(preparedFile.afterContent),
        ])
      ),
    };
    const transaction = createInstallationTransaction({
      operation: 'localize',
      appPath: paths.appPath,
      cursorVersion: version,
      files: preparedFiles,
      finalState,
    }, options);
    if (transaction) {
      commitTransaction(transaction, {
        ...options,
        applyReplacements: createTransactionWriter(paths),
        writeFinalState: (state) => writeState(state, options),
      });
    } else {
      writeState(finalState, options);
      console.log('  ℹ️ 安装文件已是目标状态，无需重复写入');
    }
  } catch (e) {
    throw new Error(`安装文件提交失败: ${e.message}`);
  }

  if (PLATFORM === 'darwin') {
    fixMacGatekeeper(paths.appBundlePath);
  }

  console.log('📦 步骤 4/4: 配置 VS Code 中文语言包');
  cmdLocale();

  console.log('\n🎉 汉化完成！请重启 Cursor 查看中文界面。');
  console.log('   若 Cursor 更新后界面恢复英文，请重新运行: node index.js localize\n');
}

function cmdRestore(options = {}) {
  recoverPendingTransactions(options);
  const paths = requireCursorPaths(options);
  ensureNotRunning(paths);
  const version = readCursorVersion(paths.appPath);
  const writableFiles = [paths.productJsonPath, ...paths.targets.map((t) => t.abs)];

  prepareAppForWrite(paths.appBundlePath, writableFiles);

  console.log('\n⏪ 恢复英文原版...\n');
  const preparedFiles = [];
  const currentState = readState();
  const stateMatchesInstallation = isStateForInstallation(currentState, paths.appPath);

  function assertRestoreSource(filePath, relativePath, backupContent) {
    const localizedHash = stateMatchesInstallation
      ? currentState.installationFileHashes?.[relativePath]
      : null;
    const currentContent = fs.readFileSync(filePath);
    const currentSha256 = calculateSha256(currentContent);
    if (currentSha256 !== calculateSha256(backupContent) && currentSha256 !== localizedHash) {
      throw new Error(
        `${path.basename(relativePath)} 与备份或最近一次汉化状态不一致。为避免覆盖外部修改，本次恢复已停止。`
      );
    }
    return { currentContent, currentSha256 };
  }

  const targetBackups = new Map(
    paths.targets.map((target) => [
      target.rel,
      readBackup(target.abs, version, options),
    ])
  );
  const productBackup = readBackup(paths.productJsonPath, version, options);
  const availableBackupCount =
    [...targetBackups.values()].filter(Boolean).length + (productBackup ? 1 : 0);
  if (availableBackupCount === 0) {
    console.log('\n⚠️ 未找到备份文件。请先执行 localize 创建备份。\n');
    return;
  }

  assertRequiredRestoreBackups(paths, targetBackups, productBackup);

  for (const target of paths.targets) {
    const backup = targetBackups.get(target.rel);
    if (backup) {
      const verifiedCurrentFile = assertRestoreSource(
        target.abs,
        target.rel,
        backup.content
      );
      preparedFiles.push(
        createPreparedFile(
          target.rel,
          'javascript',
          verifiedCurrentFile.currentContent,
          backup.content
        )
      );
      console.log(`  ✅ 已准备还原: ${path.basename(target.abs)}`);
    }
  }

  if (productBackup) {
    const verifiedProductJson = assertRestoreSource(
      paths.productJsonPath,
      'product.json',
      productBackup.content
    );
    preparedFiles.push(
      createPreparedFile(
        'product.json',
        'json',
        verifiedProductJson.currentContent,
        productBackup.content
      )
    );
    console.log('  ✅ 已准备还原: product.json');
  }

  if (preparedFiles.length > 0) {
    const finalState = stateMatchesInstallation
      ? {
          ...currentState,
          localizedVersion: null,
          restoredAt: new Date().toISOString(),
          installationFileHashes: Object.fromEntries(
            preparedFiles.map((preparedFile) => [
              preparedFile.relativePath,
              calculateSha256(preparedFile.afterContent),
            ])
          ),
        }
      : {
          appPath: paths.appPath,
          localizedVersion: null,
          restoredAt: new Date().toISOString(),
        };
    const transaction = createInstallationTransaction({
      operation: 'restore',
      appPath: paths.appPath,
      cursorVersion: version,
      files: preparedFiles,
      finalState,
    }, options);
    if (transaction) {
      commitTransaction(transaction, {
        ...options,
        applyReplacements: createTransactionWriter(paths),
        writeFinalState: (state) => writeState(state, options),
      });
    } else {
      writeState(finalState, options);
      console.log('  ℹ️ 安装文件已是英文原版，无需重复写入');
    }
    if (PLATFORM === 'darwin') fixMacGatekeeper(paths.appBundlePath);
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
    if (command === 'localize') cmdLocalize(options);
    else cmdRestore(options);
    return;
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error('错误:', e.message);
    process.exit(1);
  });
}

module.exports = {
  assertRequiredRestoreBackups,
  cmdLocalize,
  cmdLocale,
  cmdRestore,
  cmdStatus,
  ensureNotRunning,
  main,
  recoverPendingTransactions,
  requireCursorPaths,
};
