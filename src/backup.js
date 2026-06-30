const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function backupKey(filePath) {
  return crypto.createHash('sha256').update(filePath).digest('hex').slice(0, 16);
}

function getBackupDir(cursorVersion) {
  const dir = path.join(
    require('os').homedir(),
    '.cursor-i18n-zh',
    'backups',
    cursorVersion || 'unknown'
  );
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function backupPath(filePath, cursorVersion) {
  const base = path.basename(filePath);
  return path.join(getBackupDir(cursorVersion), `${base}.${backupKey(filePath)}.backup`);
}

function ensureWritable(filePath) {
  try {
    fs.chmodSync(filePath, 0o644);
  } catch {
    /* ignore */
  }
}

function ensureBackup(filePath, cursorVersion) {
  const bp = backupPath(filePath, cursorVersion);
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

function restoreFromBackup(filePath, cursorVersion) {
  const bp = backupPath(filePath, cursorVersion);
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

function hasBackup(filePath, cursorVersion) {
  return (
    fs.existsSync(backupPath(filePath, cursorVersion)) ||
    fs.existsSync(`${filePath}.backup`)
  );
}

function listBackupVersions() {
  const root = path.join(require('os').homedir(), '.cursor-i18n-zh', 'backups');
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
};
