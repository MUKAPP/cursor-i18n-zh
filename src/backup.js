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

function ensureBackup(filePath, cursorVersion, options = {}) {
  ensureBackupDir(cursorVersion, options);
  const bp = backupPath(filePath, cursorVersion, options);
  if (fs.existsSync(bp)) {
    return { action: 'existing-backup', path: bp };
  }
  if (fs.existsSync(filePath)) {
    fs.copyFileSync(filePath, bp);
    return { action: 'created-backup', path: bp };
  }
  return null;
}

function resolveBackupPath(filePath, cursorVersion, options = {}) {
  const bp = backupPath(filePath, cursorVersion, options);
  if (fs.existsSync(bp)) return bp;

  const legacyBackupPath = `${filePath}.backup`;
  return fs.existsSync(legacyBackupPath) ? legacyBackupPath : null;
}

function readBackup(filePath, cursorVersion, options = {}) {
  const resolvedBackupPath = resolveBackupPath(filePath, cursorVersion, options);
  if (!resolvedBackupPath) return null;

  return {
    path: resolvedBackupPath,
    content: fs.readFileSync(resolvedBackupPath),
  };
}

function restoreFromBackup(filePath, cursorVersion, options = {}) {
  const backup = readBackup(filePath, cursorVersion, options);
  if (!backup) return false;

  fs.copyFileSync(backup.path, filePath);
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
  readBackup,
  resolveBackupPath,
  restoreFromBackup,
  hasBackup,
  listBackupVersions,
  getBackupDir,
  ensureBackupDir,
  resolveBackupRoot,
};
