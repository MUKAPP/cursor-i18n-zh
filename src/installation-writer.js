'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  PROTOCOL_VERSION,
  applyWriteRequest,
  calculateSha256,
  parseWriteRequest,
} = require('./elevated-helper');

const DEFAULT_PKEXEC_PATH = '/usr/bin/pkexec';
const DEFAULT_SYSTEM_NODE_PATH = '/usr/bin/node';
const DEFAULT_HELPER_PATH =
  '/usr/local/libexec/cursor-i18n-zh/elevated-helper.js';

function normalizeReplacement(appPath, replacement, fileSystem = fs) {
  if (!replacement || typeof replacement.relativePath !== 'string') {
    throw new Error('安装文件替换项缺少相对路径');
  }

  const targetPath = path.join(appPath, replacement.relativePath);
  const relativeTargetPath = path.relative(appPath, targetPath);
  if (
    relativeTargetPath.startsWith('..') ||
    path.isAbsolute(relativeTargetPath)
  ) {
    throw new Error(`安装文件目标超出 Cursor 目录: ${replacement.relativePath}`);
  }

  const content = Buffer.isBuffer(replacement.content)
    ? replacement.content
    : Buffer.from(replacement.content, replacement.encoding || 'utf8');
  const originalContent = fileSystem.readFileSync(targetPath);
  const currentSha256 = calculateSha256(originalContent);
  const expectedSha256 = replacement.expectedSha256 || currentSha256;
  if (currentSha256 !== expectedSha256) {
    throw new Error(`目标文件在生成写入请求前已发生变化: ${replacement.relativePath}`);
  }

  return {
    relativePath: replacement.relativePath.split(path.sep).join('/'),
    expectedSha256,
    contentSha256: calculateSha256(content),
    contentBase64: content.toString('base64'),
  };
}

function createWriteRequest(appPath, replacements, options = {}) {
  const fileSystem = options.fileSystem || fs;
  if (!Array.isArray(replacements) || replacements.length === 0) {
    throw new Error('没有需要写入的 Cursor 安装文件');
  }

  return {
    protocolVersion: PROTOCOL_VERSION,
    operation: 'replace-installation-files',
    appPath,
    files: replacements.map((replacement) =>
      normalizeReplacement(appPath, replacement, fileSystem)
    ),
  };
}

function assertTrustedRootFile(filePath, description, options = {}) {
  const fileSystem = options.fileSystem || fs;
  if (!path.isAbsolute(filePath)) {
    throw new Error(`${description} 必须使用绝对路径`);
  }

  const canonicalPath = fileSystem.realpathSync(filePath);
  const fileStat = fileSystem.lstatSync(canonicalPath);
  if (!fileStat.isFile() || fileStat.isSymbolicLink()) {
    throw new Error(`${description} 不是可信普通文件: ${canonicalPath}`);
  }
  if (fileStat.uid !== 0 || (fileStat.mode & 0o022) !== 0) {
    throw new Error(`${description} 必须由 root 所有且不能被组或其他用户写入: ${canonicalPath}`);
  }

  let parentPath = path.dirname(canonicalPath);
  while (parentPath !== path.dirname(parentPath)) {
    const parentStat = fileSystem.lstatSync(parentPath);
    if (!parentStat.isDirectory() || parentStat.uid !== 0 || (parentStat.mode & 0o022) !== 0) {
      throw new Error(`${description} 的父目录不可信: ${parentPath}`);
    }
    parentPath = path.dirname(parentPath);
  }

  return canonicalPath;
}

function invokeElevatedHelper(writeRequest, options = {}) {
  const fileSystem = options.fileSystem || fs;
  const spawnProcessSync = options.spawnProcessSync || spawnSync;
  const pkexecPath = options.pkexecPath || DEFAULT_PKEXEC_PATH;
  const nodePath = options.nodePath || DEFAULT_SYSTEM_NODE_PATH;
  const helperPath = options.helperPath || DEFAULT_HELPER_PATH;
  const skipTrustCheck = options.skipTrustCheck === true;

  let trustedPkexecPath = pkexecPath;
  let trustedNodePath = nodePath;
  let trustedHelperPath = helperPath;
  if (!skipTrustCheck) {
    try {
      trustedPkexecPath = assertTrustedRootFile(pkexecPath, 'pkexec', { fileSystem });
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(
          `未找到受信任的 pkexec（默认 ${DEFAULT_PKEXEC_PATH}）。请安装 policykit-1 后重试。原始错误: ${error.message}`
        );
      }
      throw error;
    }

    try {
      trustedNodePath = assertTrustedRootFile(nodePath, '系统 Node.js', { fileSystem });
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(
          `未找到受信任的系统 Node.js（默认 ${DEFAULT_SYSTEM_NODE_PATH}）。` +
            '提权 helper 不能使用 nvm/用户目录中的 Node，请安装系统包，例如: sudo apt install nodejs。' +
            `原始错误: ${error.message}`
        );
      }
      throw error;
    }

    try {
      trustedHelperPath = assertTrustedRootFile(helperPath, '提权 helper', { fileSystem });
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(
          `未安装受信任的 Linux 提权 helper（默认 ${DEFAULT_HELPER_PATH}）。` +
            '请先按 README 的“Linux 提权 helper”步骤安装。' +
            `原始错误: ${error.message}`
        );
      }
      throw error;
    }
  }

  const serializedRequest = JSON.stringify(writeRequest);
  const result = spawnProcessSync(
    trustedPkexecPath,
    [trustedNodePath, trustedHelperPath, '--stdio'],
    {
      encoding: 'utf8',
      input: serializedRequest,
      maxBuffer: 4 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'],
    }
  );

  if (result.status === 126 || result.status === 127) {
    throw new Error('管理员授权已取消或无法获得授权');
  }
  if (result.error) {
    if (result.error.code === 'EPIPE') {
      throw new Error('管理员授权已取消或提权进程提前退出');
    }
    throw new Error(`无法启动 pkexec: ${result.error.message}`);
  }

  let response;
  try {
    response = JSON.parse((result.stdout || '').trim());
  } catch {
    const diagnostic = (result.stderr || '').trim();
    throw new Error(
      `提权 helper 返回了无效响应${diagnostic ? `: ${diagnostic}` : ''}`
    );
  }

  if (result.status !== 0 || !response.ok) {
    throw new Error(response.error || (result.stderr || '').trim() || '提权写入失败');
  }

  return response;
}

function applyInstallationReplacements(appPath, replacements, options = {}) {
  const fileSystem = options.fileSystem || fs;
  const writeRequest = createWriteRequest(appPath, replacements, { fileSystem });
  if (typeof options.ensureNotRunning === 'function') {
    options.ensureNotRunning();
  }

  if (options.needsElevation) {
    if ((options.platform || process.platform) !== 'linux') {
      throw new Error('当前平台不支持受限 pkexec 提权写入');
    }
    return invokeElevatedHelper(writeRequest, options);
  }

  const parsedWriteRequest = parseWriteRequest(JSON.stringify(writeRequest));
  return applyWriteRequest(parsedWriteRequest, {
    ...options,
    allowedAppPaths: [appPath],
    fileSystem,
    skipOwnershipCheck: true,
    skipProcessCheck: true,
  });
}

module.exports = {
  DEFAULT_HELPER_PATH,
  DEFAULT_PKEXEC_PATH,
  DEFAULT_SYSTEM_NODE_PATH,
  applyInstallationReplacements,
  assertTrustedRootFile,
  createWriteRequest,
  invokeElevatedHelper,
};
