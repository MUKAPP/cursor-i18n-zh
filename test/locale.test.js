const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const {
  configureDisplayLanguage,
  readLocaleConfiguration,
} = require('../src/locale');
const {
  createTemporaryDirectory,
  removeTemporaryDirectory,
} = require('./helpers');

test('Linux 只写 locale.json，不修改现有 settings.json', () => {
  const homeDirectory = createTemporaryDirectory('cursor-i18n-locale-');
  const userDirectory = path.join(homeDirectory, '.config', 'Cursor', 'User');
  const settingsPath = path.join(userDirectory, 'settings.json');
  const originalSettings = '{\n  // 保留用户注释\n  "editor.fontSize": 16,\n}\n';

  try {
    fs.mkdirSync(userDirectory, { recursive: true });
    fs.writeFileSync(settingsPath, originalSettings, 'utf8');

    const localePath = configureDisplayLanguage({
      platform: 'linux',
      homeDirectory,
      environment: {},
    });

    assert.equal(localePath, path.join(userDirectory, 'locale.json'));
    assert.deepEqual(JSON.parse(fs.readFileSync(localePath, 'utf8')), {
      locale: 'zh-cn',
    });
    assert.equal(fs.readFileSync(settingsPath, 'utf8'), originalSettings);

    const localeConfiguration = readLocaleConfiguration({
      platform: 'linux',
      homeDirectory,
      environment: {},
    });
    assert.equal(localeConfiguration.locale, 'zh-cn');
  } finally {
    removeTemporaryDirectory(homeDirectory);
  }
});
