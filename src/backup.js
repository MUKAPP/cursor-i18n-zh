const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { resolveToolDataDirectory } = require('./user-context');

function backupKey(filePath) {
  return crypto.createHash('sha256').update(filePath).digest('hex').slice(0, 16);
}

function resolveBackupRoot(options = {}) {
  return path.join(resolveToolDataDirectory(options), 'backups');
}

function getBackupDir(cursorVersion, options = {}) {
  return path.join(
    resolveBackupRoot(options),
    cursorVersion || 'unknown'
  );
}

function ensureBackupDir(cursorVersion, options = {}) {
  const backupDirectory = getBackupDir(cursorVersion, options);
  fs.mkdirSync(backupDirectory, { recursive: true });
  return backupDirectory;
}

function backupPath(filePath, cursorVersion, options = {}) {
  const base = path.basename(filePath);
  return path.join(
    getBackupDir(cursorVersion, options),
    `${base}.${backupKey(filePath)}.backup`
  );
}

function ensureWritable(filePath) {
  try {
    fs.chmodSync(filePath, 0o644);
  } catch {
    /* ignore */
  }
}

function ensureBackup(filePath, cursorVersion, options = {}) {
  ensureBackupDir(cursorVersion, options);
  const bp = backupPath(filePath, cursorVersion, options);
  if (fs.existsSync(bp)) {
    ensureWritable(filePath);
    fs.copyFileSync(bp, filePath);
    return { action: 'restored-from-backup', path: bp };
  }
  if (fs.existsSync(filePath)) {
    fs.copyFileSync(filePath, bp);
    return { action: 'created-backup', path: bp };
  }
  return null;
}

function restoreFromBackup(filePath, cursorVersion, options = {}) {
  const bp = backupPath(filePath, cursorVersion, options);
  if (!fs.existsSync(bp)) {
    // 兼容旧版：应用包内的 .backup 文件
    const legacy = `${filePath}.backup`;
    if (!fs.existsSync(legacy)) return false;
    ensureWritable(filePath);
    fs.copyFileSync(legacy, filePath);
    return true;
  }
  ensureWritable(filePath);
  fs.copyFileSync(bp, filePath);
  return true;
}

function hasBackup(filePath, cursorVersion, options = {}) {
  return (
    fs.existsSync(backupPath(filePath, cursorVersion, options)) ||
    fs.existsSync(`${filePath}.backup`)
  );
}

function listBackupVersions(options = {}) {
  const root = resolveBackupRoot(options);
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root).filter((n) => fs.statSync(path.join(root, n)).isDirectory());
}

module.exports = {
  backupPath,
  ensureBackup,
  restoreFromBackup,
  hasBackup,
  listBackupVersions,
  getBackupDir,
  ensureBackupDir,
  resolveBackupRoot,
};
