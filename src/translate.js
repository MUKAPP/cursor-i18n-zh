const fs = require('fs');
const { execSync } = require('child_process');
const { safeGlobalDict, riskyShortWords } = require('./dict');
const { applyTrickyReplacements } = require('./tricky');
const { applySettingsNav } = require('./settings-nav');

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const safeEntries = Object.entries(safeGlobalDict).sort((a, b) => b[0].length - a[0].length);
const safePattern = safeEntries.map(([en]) => escapeRegExp(en)).join('|');
const safeMegaRegex = safePattern ? new RegExp(`(["'\`])(${safePattern})\\1`, 'g') : null;

const longEntries = safeEntries.filter(([en]) => en.length >= 20);
const longPattern = longEntries.map(([en]) => escapeRegExp(en)).join('|');
const longMegaRegex = longPattern ? new RegExp(`(${longPattern})`, 'g') : null;

const uiProps = [
  'children',
  'title',
  'label',
  'placeholder',
  'description',
  'tooltip',
  'text',
  'value',
  'original',
  'message',
  'altText',
  'caption',
  'heading',
];
const uiPropsPattern = uiProps.join('|');

const riskyRegexes = Object.entries(riskyShortWords).map(([en, zh]) => {
  const escaped = escapeRegExp(en);
  return {
    en,
    zh,
    propRegex: new RegExp(`(${uiPropsPattern})\\s*:\\s*(["'\`])(${escaped})\\2`, 'g'),
    jsxRegex: new RegExp(`(null|}|\\w)\\s*,\\s*(["'\`])(${escaped})\\2\\s*(?=[,)])`, 'g'),
    htmlRegex: new RegExp(`>\\s*(${escaped})\\s*<`, 'g'),
  };
});

function translateContent(jsContent) {
  let content = jsContent;

  if (safeMegaRegex) {
    content = content.replace(safeMegaRegex, (match, quote, en) => `${quote}${safeGlobalDict[en]}${quote}`);
  }

  if (longMegaRegex) {
    content = content.replace(longMegaRegex, (match, en) => safeGlobalDict[en]);
  }

  content = applyTrickyReplacements(content);
  content = applySettingsNav(content);

  for (const { zh, propRegex, jsxRegex, htmlRegex } of riskyRegexes) {
    content = content.replace(propRegex, `$1: $2${zh}$2`);
    content = content.replace(jsxRegex, `$1, $2${zh}$2`);
    content = content.replace(htmlRegex, `>${zh}<`);
  }

  return content;
}

function translateFile(filePath) {
  const original = fs.readFileSync(filePath, 'utf8');
  const translated = translateContent(original);
  const changed = translated !== original;
  if (changed) {
    fs.writeFileSync(filePath, translated, 'utf8');
  }
  return { changed, bytes: translated.length };
}

function fixMacGatekeeper(appBundlePath) {
  if (!appBundlePath || !appBundlePath.endsWith('.app')) return;

  try {
    execSync(`xattr -cr "${appBundlePath}"`, { stdio: 'pipe' });
    console.log('  ✅ 已清除 macOS 隔离属性');
  } catch (e) {
    console.log(`  ⚠️ 清除隔离属性失败: ${e.message}`);
  }

  try {
    execSync(`codesign --force --deep --sign - "${appBundlePath}"`, { stdio: 'pipe' });
    console.log('  ✅ 已完成本地重签名');
  } catch (e) {
    console.log(`  ⚠️ 重签名失败（可能未安装 Xcode 命令行工具）: ${e.message}`);
  }
}

module.exports = { translateContent, translateFile, fixMacGatekeeper };
