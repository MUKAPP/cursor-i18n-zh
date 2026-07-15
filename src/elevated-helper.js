#!/usr/bin/node

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PROTOCOL_VERSION = 1;
const MAX_REQUEST_BYTES = 512 * 1024 * 1024;
const ALLOWED_RELATIVE_PATHS = new Set([
  'product.json',
  'out/vs/workbench/workbench.desktop.main.js',
  'out/vs/workbench/workbench.glass.main.js',
  'out/vs/workbench/workbench.anysphere-ui-automations.js',
]);
const SYSTEM_CURSOR_APP_PATHS = [
  '/usr/share/cursor/resources/app',
  '/usr/lib/cursor/resources/app',
  '/opt/Cursor/resources/app',
];

function calculateSha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function assertExactObjectKeys(value, allowedKeys, objectName) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${objectName} 必须是对象`);
  }

  const unknownKeys = Object.keys(value).filter((key) => !allowedKeys.includes(key));
  if (unknownKeys.length > 0) {
    throw new Error(`${objectName} 包含未知字段: ${unknownKeys.join(', ')}`);
  }
}

function parseWriteRequest(serializedRequest) {
  const requestBytes = Buffer.byteLength(serializedRequest);
  if (requestBytes === 0 || requestBytes > MAX_REQUEST_BYTES) {
    throw new Error('提权写入请求为空或超过大小限制');
  }

  let request;
  try {
    request = JSON.parse(serializedRequest);
  } catch (error) {
    throw new Error(`提权写入请求不是有效 JSON: ${error.message}`);
  }

  assertExactObjectKeys(
    request,
    ['protocolVersion', 'operation', 'appPath', 'files'],
    '提权写入请求'
  );
  if (request.protocolVersion !== PROTOCOL_VERSION) {
    throw new Error(`不支持的提权协议版本: ${request.protocolVersion}`);
  }
  if (request.operation !== 'replace-installation-files') {
    throw new Error(`不支持的提权操作: ${request.operation}`);
  }
  if (typeof request.appPath !== 'string' || !path.isAbsolute(request.appPath)) {
    throw new Error('Cursor 安装路径必须是绝对路径');
  }
  if (!Array.isArray(request.files) || request.files.length === 0) {
    throw new Error('提权写入请求没有目标文件');
  }
  if (request.files.length > ALLOWED_RELATIVE_PATHS.size) {
    throw new Error('提权写入请求包含过多目标文件');
  }

  const relativePaths = new Set();
  let decodedContentBytes = 0;
  const files = request.files.map((fileRequest, fileIndex) => {
    assertExactObjectKeys(
      fileRequest,
      ['relativePath', 'expectedSha256', 'contentSha256', 'contentBase64'],
      `目标文件 ${fileIndex + 1}`
    );

    if (
      typeof fileRequest.relativePath !== 'string' ||
      !ALLOWED_RELATIVE_PATHS.has(fileRequest.relativePath) ||
      path.isAbsolute(fileRequest.relativePath) ||
      fileRequest.relativePath.split('/').includes('..')
    ) {
      throw new Error(`不允许写入目标路径: ${fileRequest.relativePath}`);
    }
    if (relativePaths.has(fileRequest.relativePath)) {
      throw new Error(`提权写入请求包含重复目标: ${fileRequest.relativePath}`);
    }
    relativePaths.add(fileRequest.relativePath);

    if (!/^[a-f0-9]{64}$/.test(fileRequest.expectedSha256 || '')) {
      throw new Error(`目标文件 ${fileRequest.relativePath} 的原始摘要无效`);
    }
    if (!/^[a-f0-9]{64}$/.test(fileRequest.contentSha256 || '')) {
      throw new Error(`目标文件 ${fileRequest.relativePath} 的新内容摘要无效`);
    }
    if (typeof fileRequest.contentBase64 !== 'string') {
      throw new Error(`目标文件 ${fileRequest.relativePath} 的内容编码无效`);
    }

    const content = Buffer.from(fileRequest.contentBase64, 'base64');
    const canonicalBase64 = content.toString('base64');
    if (canonicalBase64 !== fileRequest.contentBase64) {
      throw new Error(`目标文件 ${fileRequest.relativePath} 不是规范 Base64`);
    }
    if (calculateSha256(content) !== fileRequest.contentSha256) {
      throw new Error(`目标文件 ${fileRequest.relativePath} 的新内容摘要不匹配`);
    }

    decodedContentBytes += content.length;
    if (decodedContentBytes > MAX_REQUEST_BYTES) {
      throw new Error('提权写入内容超过大小限制');
    }

    return {
      relativePath: fileRequest.relativePath,
      expectedSha256: fileRequest.expectedSha256,
      contentSha256: fileRequest.contentSha256,
      content,
    };
  });

  return {
    protocolVersion: request.protocolVersion,
    operation: request.operation,
    appPath: request.appPath,
    files,
  };
}

function validateSystemAppPath(requestedAppPath, options = {}) {
  const fileSystem = options.fileSystem || fs;
  const allowedAppPaths = options.allowedAppPaths || SYSTEM_CURSOR_APP_PATHS;
  const resolvedAppPath = path.resolve(requestedAppPath);
  const canonicalAppPath = fileSystem.realpathSync(resolvedAppPath);
  const canonicalAllowedPaths = allowedAppPaths.map((allowedAppPath) => {
    try {
      return fileSystem.realpathSync(path.resolve(allowedAppPath));
    } catch {
      return path.resolve(allowedAppPath);
    }
  });

  if (!canonicalAllowedPaths.includes(canonicalAppPath)) {
    throw new Error(`不允许提权写入此 Cursor 安装目录: ${canonicalAppPath}`);
  }
  if (!fileSystem.statSync(canonicalAppPath).isDirectory()) {
    throw new Error('Cursor 安装路径不是目录');
  }

  const packageJsonPath = path.join(canonicalAppPath, 'package.json');
  const productJsonPath = path.join(canonicalAppPath, 'product.json');
  const desktopWorkbenchPath = path.join(
    canonicalAppPath,
    'out/vs/workbench/workbench.desktop.main.js'
  );
  const packageJson = JSON.parse(fileSystem.readFileSync(packageJsonPath, 'utf8'));
  JSON.parse(fileSystem.readFileSync(productJsonPath, 'utf8'));
  if (!packageJson || typeof packageJson.version !== 'string') {
    throw new Error('Cursor package.json 缺少版本信息');
  }
  if (!fileSystem.statSync(desktopWorkbenchPath).isFile()) {
    throw new Error('Cursor 安装缺少 desktop workbench 文件');
  }

  return canonicalAppPath;
}

function assertTrustedRootDirectoryTree(directoryPath, options = {}) {
  if (options.skipOwnershipCheck) return;

  const fileSystem = options.fileSystem || fs;
  const resolvedDirectoryPath = path.resolve(directoryPath);
  const pathSegments = resolvedDirectoryPath.split(path.sep).filter(Boolean);
  let currentPath = path.parse(resolvedDirectoryPath).root;

  for (const pathSegment of pathSegments) {
    currentPath = path.join(currentPath, pathSegment);
    const directoryStat = fileSystem.lstatSync(currentPath);
    if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) {
      throw new Error(`提权目标父路径不是可信目录: ${currentPath}`);
    }
    if (directoryStat.uid !== 0 || (directoryStat.mode & 0o022) !== 0) {
      throw new Error(`提权目标父目录必须由 root 所有且不可被普通用户写入: ${currentPath}`);
    }
    if (fileSystem.realpathSync(currentPath) !== currentPath) {
      throw new Error(`提权目标父路径包含符号链接: ${currentPath}`);
    }
  }
}

function detectLinuxCursorStatus(appPath, options = {}) {
  if (options.skipProcessCheck) return { status: 'not-running' };

  const fileSystem = options.fileSystem || fs;
  const procDirectory = options.procDirectory || '/proc';
  const installationRoot = path.resolve(appPath, '..', '..');
  const currentProcessId = String(options.currentProcessId || process.pid);

  try {
    const processIds = fileSystem
      .readdirSync(procDirectory)
      .filter((directoryName) => /^\d+$/.test(directoryName));
    let foundUncertainCursorProcess = false;

    for (const processId of processIds) {
      if (processId === currentProcessId) continue;

      let processName = '';
      try {
        processName = fileSystem
          .readFileSync(path.join(procDirectory, processId, 'comm'), 'utf8')
          .trim()
          .toLowerCase();
      } catch {
        // 可执行文件路径仍可提供精确判断。
      }

      try {
        const executablePath = fileSystem.realpathSync(
          path.join(procDirectory, processId, 'exe')
        );
        const executableIsInsideInstallation =
          executablePath === installationRoot ||
          executablePath.startsWith(`${installationRoot}${path.sep}`);
        const executableName = path.basename(executablePath).toLowerCase();
        const looksLikeCursor =
          executableName.includes('cursor') || processName.includes('cursor');
        if (executableIsInsideInstallation && looksLikeCursor) {
          return { status: 'running', processId: Number(processId) };
        }
      } catch (error) {
        if (error.code === 'ENOENT' || error.code === 'ESRCH') {
          continue;
        }

        const accessDenied = error.code === 'EACCES' || error.code === 'EPERM';
        const processMightBeCursor =
          processName.includes('cursor') || (!processName && accessDenied);
        if (processMightBeCursor) {
          foundUncertainCursorProcess = true;
        }
      }
    }

    return foundUncertainCursorProcess
      ? { status: 'unknown' }
      : { status: 'not-running' };
  } catch {
    return { status: 'unknown' };
  }
}

function fsyncDirectory(directoryPath, fileSystem = fs) {
  let directoryDescriptor;
  try {
    directoryDescriptor = fileSystem.openSync(directoryPath, 'r');
    fileSystem.fsyncSync(directoryDescriptor);
  } finally {
    if (directoryDescriptor !== undefined) {
      fileSystem.closeSync(directoryDescriptor);
    }
  }
}

function replaceFileAtomically(targetPath, content, metadata, options = {}) {
  const fileSystem = options.fileSystem || fs;
  const targetDirectory = path.dirname(targetPath);
  const temporaryPath = path.join(
    targetDirectory,
    `.${path.basename(targetPath)}.cursor-i18n-${process.pid}-${crypto.randomBytes(8).toString('hex')}.tmp`
  );
  let temporaryDescriptor;
  let targetReplaced = false;

  try {
    temporaryDescriptor = fileSystem.openSync(
      temporaryPath,
      fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY,
      metadata.mode & 0o777
    );
    fileSystem.writeFileSync(temporaryDescriptor, content);
    if (typeof fileSystem.fchmodSync === 'function') {
      fileSystem.fchmodSync(temporaryDescriptor, metadata.mode & 0o777);
    }
    if (typeof fileSystem.fchownSync === 'function' && metadata.uid !== undefined) {
      fileSystem.fchownSync(temporaryDescriptor, metadata.uid, metadata.gid);
    }
    fileSystem.fsyncSync(temporaryDescriptor);
    fileSystem.closeSync(temporaryDescriptor);
    temporaryDescriptor = undefined;
    fileSystem.renameSync(temporaryPath, targetPath);
    targetReplaced = true;
    fsyncDirectory(targetDirectory, fileSystem);
  } catch (error) {
    error.targetReplaced = targetReplaced;
    if (temporaryDescriptor !== undefined) {
      try {
        fileSystem.closeSync(temporaryDescriptor);
      } catch {
        // 保留最初的写入错误。
      }
    }
    try {
      fileSystem.unlinkSync(temporaryPath);
    } catch {
      // 临时文件可能尚未创建或已完成 rename。
    }
    throw error;
  }
}

function applyWriteRequest(request, options = {}) {
  const fileSystem = options.fileSystem || fs;
  const replaceFile = options.replaceFile || replaceFileAtomically;
  const canonicalAppPath = validateSystemAppPath(request.appPath, options);
  const processStatus = detectLinuxCursorStatus(canonicalAppPath, options);
  if (processStatus.status === 'running') {
    throw new Error(`检测到 Cursor 仍在运行（PID: ${processStatus.processId}）`);
  }
  if (processStatus.status === 'unknown') {
    throw new Error('提权进程无法确认 Cursor 是否仍在运行');
  }

  const preparedFiles = request.files.map((fileRequest) => {
    const targetPath = path.join(canonicalAppPath, fileRequest.relativePath);
    assertTrustedRootDirectoryTree(path.dirname(targetPath), options);
    const targetStat = fileSystem.lstatSync(targetPath);
    if (targetStat.isSymbolicLink() || !targetStat.isFile()) {
      throw new Error(`目标不是普通文件: ${fileRequest.relativePath}`);
    }
    if (
      !options.skipOwnershipCheck &&
      (targetStat.uid !== 0 || (targetStat.mode & 0o022) !== 0)
    ) {
      throw new Error(
        `目标文件必须由 root 所有且不可被普通用户写入: ${fileRequest.relativePath}`
      );
    }
    const canonicalTargetPath = fileSystem.realpathSync(targetPath);
    if (canonicalTargetPath !== targetPath) {
      throw new Error(`目标路径包含符号链接: ${fileRequest.relativePath}`);
    }

    const originalContent = fileSystem.readFileSync(targetPath);
    if (calculateSha256(originalContent) !== fileRequest.expectedSha256) {
      throw new Error(`目标文件已发生变化: ${fileRequest.relativePath}`);
    }

    return {
      ...fileRequest,
      targetPath,
      originalContent,
      metadata: {
        mode: targetStat.mode,
        uid: targetStat.uid,
        gid: targetStat.gid,
      },
    };
  });

  const committedFiles = [];
  try {
    for (const preparedFile of preparedFiles) {
      try {
        replaceFile(
          preparedFile.targetPath,
          preparedFile.content,
          preparedFile.metadata,
          options
        );
        committedFiles.push(preparedFile);
      } catch (replaceError) {
        if (replaceError.targetReplaced) {
          committedFiles.push(preparedFile);
        }
        throw replaceError;
      }
    }
  } catch (commitError) {
    const rollbackErrors = [];
    for (const committedFile of committedFiles.reverse()) {
      try {
        replaceFile(
          committedFile.targetPath,
          committedFile.originalContent,
          committedFile.metadata,
          options
        );
      } catch (rollbackError) {
        rollbackErrors.push(`${committedFile.relativePath}: ${rollbackError.message}`);
      }
    }
    if (rollbackErrors.length > 0) {
      throw new Error(
        `安装文件提交失败且回滚不完整: ${commitError.message}; ${rollbackErrors.join('; ')}`
      );
    }
    throw new Error(`安装文件提交失败，已回滚: ${commitError.message}`);
  }

  return {
    writtenFiles: preparedFiles.map((preparedFile) => preparedFile.relativePath),
  };
}

function readStandardInput(options = {}) {
  const fileSystem = options.fileSystem || fs;
  const chunks = [];
  let totalBytes = 0;
  const buffer = Buffer.allocUnsafe(64 * 1024);

  while (true) {
    const bytesRead = fileSystem.readSync(0, buffer, 0, buffer.length, null);
    if (bytesRead === 0) break;
    totalBytes += bytesRead;
    if (totalBytes > MAX_REQUEST_BYTES) {
      throw new Error('提权写入请求超过大小限制');
    }
    chunks.push(Buffer.from(buffer.subarray(0, bytesRead)));
  }

  return Buffer.concat(chunks).toString('utf8');
}

function runHelper() {
  try {
    if (process.platform !== 'linux' || process.argv[2] !== '--stdio') {
      throw new Error('提权 helper 仅支持 Linux stdin 协议');
    }
    if (typeof process.getuid !== 'function' || process.getuid() !== 0) {
      throw new Error('提权 helper 必须由 pkexec 以 root 身份运行');
    }

    const request = parseWriteRequest(readStandardInput());
    const result = applyWriteRequest(request);
    process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`);
  } catch (error) {
    process.stderr.write(`提权写入失败: ${error.message}\n`);
    process.stdout.write(`${JSON.stringify({ ok: false, error: error.message })}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  runHelper();
}

module.exports = {
  ALLOWED_RELATIVE_PATHS,
  MAX_REQUEST_BYTES,
  PROTOCOL_VERSION,
  SYSTEM_CURSOR_APP_PATHS,
  applyWriteRequest,
  assertTrustedRootDirectoryTree,
  calculateSha256,
  detectLinuxCursorStatus,
  parseWriteRequest,
  replaceFileAtomically,
  validateSystemAppPath,
};
