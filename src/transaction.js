'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {
  fsyncDirectory,
  writeFileAtomically,
  writeJsonAtomically,
} = require('./atomic-file');
const { validatePreparedFiles } = require('./content-validator');
const {
  ALLOWED_RELATIVE_PATHS,
  calculateSha256,
} = require('./elevated-helper');
const { resolveToolDataDirectory } = require('./user-context');

const TRANSACTION_SCHEMA_VERSION = 1;
const JOURNAL_FILE_NAME = 'journal.json';
const ACTIVE_PHASES = new Set(['prepared', 'committing', 'committed']);
const PHASE_TRANSITIONS = new Map([
  ['prepared', new Set(['committing'])],
  ['committing', new Set(['committed'])],
  ['committed', new Set()],
]);

function resolveTransactionsRoot(options = {}) {
  return path.join(resolveToolDataDirectory(options), 'transactions');
}

function createTransactionId() {
  return `${Date.now()}-${crypto.randomBytes(12).toString('hex')}`;
}

function getJournalPath(transactionDirectory) {
  return path.join(transactionDirectory, JOURNAL_FILE_NAME);
}

function updateTransactionPhase(transaction, phase, options = {}) {
  const allowedNextPhases = PHASE_TRANSITIONS.get(transaction.journal.phase);
  if (!allowedNextPhases || !allowedNextPhases.has(phase)) {
    throw new Error(
      `事务阶段不能从 ${transaction.journal.phase} 转换为 ${phase}`
    );
  }
  const journal = {
    ...transaction.journal,
    phase,
    updatedAt: new Date().toISOString(),
  };
  writeJsonAtomically(getJournalPath(transaction.directoryPath), journal, options);
  transaction.journal = journal;
  return transaction;
}

function readAndVerifyStagedContent(transaction, fileRecord, side, options = {}) {
  const fileSystem = options.fileSystem || fs;
  const contentRecord = fileRecord[side];
  const contentPath = path.join(transaction.directoryPath, contentRecord.path);
  const relativeContentPath = path.relative(transaction.directoryPath, contentPath);
  if (
    relativeContentPath.startsWith('..') ||
    path.isAbsolute(relativeContentPath)
  ) {
    throw new Error(`事务暂存路径越界: ${contentRecord.path}`);
  }

  const contentStat = fileSystem.lstatSync(contentPath);
  if (contentStat.isSymbolicLink() || !contentStat.isFile()) {
    throw new Error(`事务暂存目标不是普通文件: ${contentRecord.path}`);
  }
  if (fileSystem.realpathSync(contentPath) !== path.resolve(contentPath)) {
    throw new Error(`事务暂存路径包含符号链接: ${contentRecord.path}`);
  }

  const content = fileSystem.readFileSync(contentPath);
  if (content.length !== contentRecord.size) {
    throw new Error(`事务暂存文件大小不匹配: ${contentRecord.path}`);
  }
  if (calculateSha256(content) !== contentRecord.sha256) {
    throw new Error(`事务暂存文件摘要不匹配: ${contentRecord.path}`);
  }
  return content;
}

function validateJournal(journal) {
  if (!journal || typeof journal !== 'object' || Array.isArray(journal)) {
    throw new Error('事务 journal 根节点必须是对象');
  }
  if (journal.schemaVersion !== TRANSACTION_SCHEMA_VERSION) {
    throw new Error(`不支持的事务 journal 版本: ${journal.schemaVersion}`);
  }
  if (!ACTIVE_PHASES.has(journal.phase)) {
    throw new Error(`事务 journal 阶段无效: ${journal.phase}`);
  }
  if (!['localize', 'restore'].includes(journal.operation)) {
    throw new Error(`事务操作无效: ${journal.operation}`);
  }
  if (typeof journal.appPath !== 'string' || !path.isAbsolute(journal.appPath)) {
    throw new Error('事务安装路径必须是绝对路径');
  }
  if (
    !journal.finalState ||
    typeof journal.finalState !== 'object' ||
    Array.isArray(journal.finalState) ||
    journal.finalState.appPath !== journal.appPath
  ) {
    throw new Error('事务最终状态与安装路径不一致');
  }
  if (!Array.isArray(journal.files) || journal.files.length === 0) {
    throw new Error('事务 journal 没有文件记录');
  }

  const relativePaths = new Set();
  for (const fileRecord of journal.files) {
    if (!fileRecord || typeof fileRecord.relativePath !== 'string') {
      throw new Error('事务文件记录缺少相对路径');
    }
    if (
      !ALLOWED_RELATIVE_PATHS.has(fileRecord.relativePath) ||
      path.isAbsolute(fileRecord.relativePath) ||
      fileRecord.relativePath.split('/').includes('..')
    ) {
      throw new Error(`事务包含不允许的目标: ${fileRecord.relativePath}`);
    }
    const expectedContentType = fileRecord.relativePath === 'product.json'
      ? 'json'
      : 'javascript';
    if (fileRecord.contentType !== expectedContentType) {
      throw new Error(`事务 ${fileRecord.relativePath} 的内容类型无效`);
    }
    if (relativePaths.has(fileRecord.relativePath)) {
      throw new Error(`事务包含重复目标: ${fileRecord.relativePath}`);
    }
    relativePaths.add(fileRecord.relativePath);
    for (const side of ['before', 'after']) {
      const contentRecord = fileRecord[side];
      if (
        !contentRecord ||
        typeof contentRecord.path !== 'string' ||
        !/^[a-f0-9]{64}$/.test(contentRecord.sha256 || '') ||
        !Number.isSafeInteger(contentRecord.size) ||
        contentRecord.size < 0
      ) {
        throw new Error(`事务 ${fileRecord.relativePath} 的 ${side} 记录无效`);
      }
      const normalizedStagedPath = contentRecord.path.replace(/\\/g, '/');
      if (
        path.isAbsolute(contentRecord.path) ||
        normalizedStagedPath.split('/').includes('..') ||
        !normalizedStagedPath.startsWith(`${side}/`)
      ) {
        throw new Error(`事务 ${fileRecord.relativePath} 的 ${side} 路径无效`);
      }
    }
  }
}

function createInstallationTransaction(input, options = {}) {
  const fileSystem = options.fileSystem || fs;
  const transactionId = createTransactionId();
  const transactionsRoot = resolveTransactionsRoot(options);
  const transactionDirectory = path.join(transactionsRoot, transactionId);
  const preparedFiles = input.files
    .map((file) => ({
      ...file,
      beforeContent: Buffer.from(file.beforeContent),
      afterContent: Buffer.from(file.afterContent),
    }))
    .filter((file) => !file.beforeContent.equals(file.afterContent));

  if (preparedFiles.length === 0) {
    return null;
  }
  validatePreparedFiles(preparedFiles);

  fileSystem.mkdirSync(transactionsRoot, { recursive: true, mode: 0o700 });
  fileSystem.mkdirSync(transactionDirectory, { recursive: false, mode: 0o700 });
  fsyncDirectory(transactionsRoot, { fileSystem });
  const fileRecords = [];
  try {
    preparedFiles.forEach((preparedFile, fileIndex) => {
      const extension = preparedFile.contentType === 'json' ? '.json' : '.js';
      const beforeRelativePath = path.join('before', `${fileIndex}${extension}`);
      const afterRelativePath = path.join('after', `${fileIndex}${extension}`);
      const beforePath = path.join(transactionDirectory, beforeRelativePath);
      const afterPath = path.join(transactionDirectory, afterRelativePath);
      writeFileAtomically(beforePath, preparedFile.beforeContent, {
        ...options,
        mode: 0o600,
      });
      writeFileAtomically(afterPath, preparedFile.afterContent, {
        ...options,
        mode: 0o600,
      });
      fileRecords.push({
        relativePath: preparedFile.relativePath,
        contentType: preparedFile.contentType,
        before: {
          path: beforeRelativePath.split(path.sep).join('/'),
          sha256: calculateSha256(preparedFile.beforeContent),
          size: preparedFile.beforeContent.length,
        },
        after: {
          path: afterRelativePath.split(path.sep).join('/'),
          sha256: calculateSha256(preparedFile.afterContent),
          size: preparedFile.afterContent.length,
        },
      });
    });

    const journal = {
      schemaVersion: TRANSACTION_SCHEMA_VERSION,
      transactionId,
      operation: input.operation,
      phase: 'prepared',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      appPath: input.appPath,
      cursorVersion: input.cursorVersion,
      files: fileRecords,
      finalState: input.finalState,
    };
    validateJournal(journal);
    writeJsonAtomically(getJournalPath(transactionDirectory), journal, options);

    const transaction = { directoryPath: transactionDirectory, journal };
    for (const fileRecord of fileRecords) {
      readAndVerifyStagedContent(transaction, fileRecord, 'before', options);
      readAndVerifyStagedContent(transaction, fileRecord, 'after', options);
    }
    return transaction;
  } catch (error) {
    fileSystem.rmSync(transactionDirectory, { recursive: true, force: true });
    throw error;
  }
}

function loadPendingTransactions(options = {}) {
  const fileSystem = options.fileSystem || fs;
  const transactionsRoot = resolveTransactionsRoot(options);
  if (!fileSystem.existsSync(transactionsRoot)) return [];

  const pendingTransactions = [];
  for (const directoryName of fileSystem.readdirSync(transactionsRoot)) {
    const transactionDirectory = path.join(transactionsRoot, directoryName);
    const transactionDirectoryStat = fileSystem.lstatSync(transactionDirectory);
    if (
      transactionDirectoryStat.isSymbolicLink() ||
      !transactionDirectoryStat.isDirectory()
    ) {
      throw new Error(`事务目录不是可信目录: ${transactionDirectory}`);
    }
    if (fileSystem.realpathSync(transactionDirectory) !== path.resolve(transactionDirectory)) {
      throw new Error(`事务目录包含符号链接: ${transactionDirectory}`);
    }
    const journalPath = getJournalPath(transactionDirectory);
    if (!fileSystem.existsSync(journalPath)) continue;

    const journal = JSON.parse(fileSystem.readFileSync(journalPath, 'utf8'));
    validateJournal(journal);
    if (journal.transactionId !== directoryName) {
      throw new Error(`事务目录与 journal ID 不一致: ${directoryName}`);
    }
    const transaction = { directoryPath: transactionDirectory, journal };
    for (const fileRecord of journal.files) {
      readAndVerifyStagedContent(transaction, fileRecord, 'before', options);
      readAndVerifyStagedContent(transaction, fileRecord, 'after', options);
    }
    pendingTransactions.push(transaction);
  }
  return pendingTransactions;
}

function inspectTransaction(transaction, options = {}) {
  const fileSystem = options.fileSystem || fs;
  const fileStates = transaction.journal.files.map((fileRecord) => {
    const installationPath = path.join(
      transaction.journal.appPath,
      fileRecord.relativePath
    );
    if (!fileSystem.existsSync(installationPath)) {
      return { fileRecord, status: 'missing' };
    }
    const currentSha256 = calculateSha256(fileSystem.readFileSync(installationPath));
    if (currentSha256 === fileRecord.before.sha256) {
      return { fileRecord, status: 'before' };
    }
    if (currentSha256 === fileRecord.after.sha256) {
      return { fileRecord, status: 'after' };
    }
    return { fileRecord, status: 'conflict' };
  });

  if (fileStates.every((fileState) => fileState.status === 'before')) {
    return { status: 'before', fileStates };
  }
  if (fileStates.every((fileState) => fileState.status === 'after')) {
    return { status: 'after', fileStates };
  }
  if (fileStates.some((fileState) => ['missing', 'conflict'].includes(fileState.status))) {
    return { status: 'conflict', fileStates };
  }
  return { status: 'mixed', fileStates };
}

function buildTransactionReplacements(transaction, side, fileStates, options = {}) {
  return fileStates.map(({ fileRecord }) => ({
    relativePath: fileRecord.relativePath,
    content: readAndVerifyStagedContent(transaction, fileRecord, side, options),
    expectedSha256:
      side === 'after' ? fileRecord.before.sha256 : fileRecord.after.sha256,
  }));
}

function completeTransaction(transaction, options = {}) {
  const fileSystem = options.fileSystem || fs;
  const transactionsRoot = path.dirname(transaction.directoryPath);
  fileSystem.rmSync(transaction.directoryPath, { recursive: true, force: true });
  fsyncDirectory(transactionsRoot, { fileSystem });
}

function assertRecoverablePhase(transaction, inspection) {
  const { phase } = transaction.journal;
  const allowedStatuses = {
    prepared: new Set(['before']),
    committing: new Set(['before', 'after', 'mixed']),
    committed: new Set(['after']),
  }[phase];

  if (!allowedStatuses || !allowedStatuses.has(inspection.status)) {
    throw new Error(
      `事务 ${transaction.journal.transactionId} 的阶段 ${phase} 与文件状态 ${inspection.status} 不一致`
    );
  }
}

function commitTransaction(transaction, options = {}) {
  if (typeof options.applyReplacements !== 'function') {
    throw new Error('事务缺少安装文件写入函数');
  }
  if (typeof options.writeFinalState !== 'function') {
    throw new Error('事务缺少最终状态写入函数');
  }

  updateTransactionPhase(transaction, 'committing', options);
  const fileStates = transaction.journal.files.map((fileRecord) => ({
    fileRecord,
    status: 'before',
  }));
  const replacements = buildTransactionReplacements(
    transaction,
    'after',
    fileStates,
    options
  );
  options.applyReplacements(replacements);
  updateTransactionPhase(transaction, 'committed', options);
  options.writeFinalState(transaction.journal.finalState);
  completeTransaction(transaction, options);
}

function recoverTransaction(transaction, options = {}) {
  if (typeof options.applyReplacements !== 'function') {
    throw new Error('事务恢复缺少安装文件写入函数');
  }
  if (typeof options.writeFinalState !== 'function') {
    throw new Error('事务恢复缺少最终状态写入函数');
  }

  const inspection = inspectTransaction(transaction, options);
  if (inspection.status === 'conflict') {
    throw new Error(
      `事务 ${transaction.journal.transactionId} 的安装文件存在外部修改或缺失，无法自动恢复`
    );
  }
  assertRecoverablePhase(transaction, inspection);
  if (inspection.status === 'after') {
    options.writeFinalState(transaction.journal.finalState);
    completeTransaction(transaction, options);
    return { action: 'completed' };
  }
  if (inspection.status === 'before') {
    completeTransaction(transaction, options);
    return { action: 'aborted' };
  }

  const afterFileStates = inspection.fileStates.filter(
    (fileState) => fileState.status === 'after'
  );
  const rollbackReplacements = buildTransactionReplacements(
    transaction,
    'before',
    afterFileStates,
    options
  );
  options.applyReplacements(rollbackReplacements);
  const finalInspection = inspectTransaction(transaction, options);
  if (finalInspection.status !== 'before') {
    throw new Error(`事务 ${transaction.journal.transactionId} 回滚后状态异常`);
  }
  completeTransaction(transaction, options);
  return { action: 'rolled-back' };
}

module.exports = {
  ACTIVE_PHASES,
  PHASE_TRANSITIONS,
  TRANSACTION_SCHEMA_VERSION,
  buildTransactionReplacements,
  commitTransaction,
  completeTransaction,
  createInstallationTransaction,
  inspectTransaction,
  loadPendingTransactions,
  readAndVerifyStagedContent,
  recoverTransaction,
  resolveTransactionsRoot,
  updateTransactionPhase,
  validateJournal,
};
