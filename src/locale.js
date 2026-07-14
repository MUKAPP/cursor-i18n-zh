const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const {
  resolveCursorExtensionsDirectory,
  resolveCursorUserDirectory,
} = require('./user-context');

const LANG_PACK_ID = 'MS-CEINTL.VSCODE-LANGUAGE-PACK-ZH-HANS';

function resolveLocalePath(options = {}) {
  return path.join(resolveCursorUserDirectory(options), 'locale.json');
}

function readLocaleConfiguration(options = {}) {
  const localePath = resolveLocalePath(options);
  try {
    const localeConfiguration = JSON.parse(fs.readFileSync(localePath, 'utf8'));
    return {
      localePath,
      locale: localeConfiguration.locale || null,
      readable: true,
    };
  } catch (error) {
    return {
      localePath,
      locale: null,
      readable: false,
      reason: error.message,
    };
  }
}

function writeJsonAtomically(filePath, data, options = {}) {
  const fileSystem = options.fileSystem || fs;
  fileSystem.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;

  try {
    fileSystem.writeFileSync(
      temporaryPath,
      `${JSON.stringify(data, null, 2)}\n`,
      'utf8'
    );
    fileSystem.renameSync(temporaryPath, filePath);
  } catch (error) {
    try {
      fileSystem.unlinkSync(temporaryPath);
    } catch {
      // 临时文件可能尚未创建，或已经被 rename 移走。
    }
    throw error;
  }
}

function configureDisplayLanguage(options = {}) {
  const localePath = resolveLocalePath(options);
  writeJsonAtomically(localePath, { locale: 'zh-cn' }, options);
  return localePath;
}

function ensureLanguagePackInstalled(options = {}) {
  const fileSystem = options.fileSystem || fs;
  const executeFileSync = options.executeFileSync || execFileSync;
  const extensionsDirectory = resolveCursorExtensionsDirectory(options);
  if (!fileSystem.existsSync(extensionsDirectory)) {
    return { installed: false, hint: '扩展目录不存在，请在 Cursor 中搜索并安装「Chinese (Simplified) Language Pack」' };
  }

  const installed = fileSystem
    .readdirSync(extensionsDirectory)
    .some((name) => name.toLowerCase().includes('language-pack-zh-hans'));
  if (installed) {
    return { installed: true, hint: '中文语言包已安装' };
  }

  try {
    executeFileSync(
      options.cursorExecutable || 'cursor',
      ['--install-extension', LANG_PACK_ID],
      { stdio: 'pipe', timeout: 60000 }
    );
    return { installed: true, hint: '已通过 CLI 安装中文语言包' };
  } catch {
    return {
      installed: false,
      hint: '请手动在 Cursor 扩展市场搜索「Chinese (Simplified) Language Pack」并安装',
    };
  }
}

function configureLocale(options = {}) {
  const results = [];

  const langPack = ensureLanguagePackInstalled(options);
  results.push(langPack);

  const localePath = configureDisplayLanguage(options);
  results.push({ localePath, locale: 'zh-cn' });

  return results;
}

module.exports = {
  LANG_PACK_ID,
  resolveLocalePath,
  readLocaleConfiguration,
  writeJsonAtomically,
  configureLocale,
  configureDisplayLanguage,
  ensureLanguagePackInstalled,
};
