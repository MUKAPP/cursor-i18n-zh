const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const { getBackupDir, hasBackup } = require('../src/backup');
const {
  createTemporaryDirectory,
  removeTemporaryDirectory,
} = require('./helpers');

test('查询备份路径和状态不会创建目录', () => {
  const homeDirectory = createTemporaryDirectory('cursor-i18n-backup-');
  const sourcePath = path.join(homeDirectory, 'workbench.desktop.main.js');

  try {
    const backupDirectory = getBackupDir('3.11.13', { homeDirectory });
    assert.equal(fs.existsSync(backupDirectory), false);
    assert.equal(hasBackup(sourcePath, '3.11.13', { homeDirectory }), false);
    assert.equal(fs.existsSync(backupDirectory), false);
  } finally {
    removeTemporaryDirectory(homeDirectory);
  }
});
