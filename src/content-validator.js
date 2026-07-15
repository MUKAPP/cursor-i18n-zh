'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { TextDecoder } = require('util');

const strictUtf8Decoder = new TextDecoder('utf-8', { fatal: true });

function decodeUtf8(content, relativePath) {
  try {
    return strictUtf8Decoder.decode(Buffer.from(content));
  } catch (error) {
    throw new Error(`${relativePath} 不是有效 UTF-8: ${error.message}`);
  }
}

function validateJavaScriptContent(content, relativePath) {
  // 先确认 UTF-8，再做语法检查。
  // Cursor workbench 打包文件可能包含 export 等 ES module 语法，
  // vm.Script 只能解析普通脚本，因此改用 node --check。
  decodeUtf8(content, relativePath);

  const temporaryDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'cursor-i18n-zh-js-check-')
  );
  const temporaryFilePath = path.join(temporaryDirectory, 'content.js');

  try {
    fs.writeFileSync(temporaryFilePath, Buffer.from(content));
    const checkResult = spawnSync(process.execPath, ['--check', temporaryFilePath], {
      encoding: 'utf8',
      maxBuffer: 4 * 1024 * 1024,
    });

    if (checkResult.status === 0) {
      return;
    }

    const errorOutput = `${checkResult.stderr || ''}${checkResult.stdout || ''}`.trim();
    const firstErrorLine = errorOutput
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);
    throw new Error(
      `${relativePath} JavaScript 语法无效: ${firstErrorLine || 'node --check 失败'}`
    );
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

function validateJsonContent(content, relativePath) {
  const sourceCode = decodeUtf8(content, relativePath);
  let parsedValue;
  try {
    parsedValue = JSON.parse(sourceCode);
  } catch (error) {
    throw new Error(`${relativePath} JSON 无效: ${error.message}`);
  }

  if (!parsedValue || typeof parsedValue !== 'object' || Array.isArray(parsedValue)) {
    throw new Error(`${relativePath} 根节点必须是对象`);
  }
  return parsedValue;
}

function validatePreparedFile(preparedFile) {
  const beforeContent = Buffer.from(preparedFile.beforeContent);
  const afterContent = Buffer.from(preparedFile.afterContent);
  if (beforeContent.length === 0 || afterContent.length === 0) {
    throw new Error(`${preparedFile.relativePath} 内容不能为空`);
  }

  const minimumExpectedBytes = Math.max(1, Math.floor(beforeContent.length * 0.5));
  if (afterContent.length < minimumExpectedBytes) {
    throw new Error(
      `${preparedFile.relativePath} 新内容相对原文件异常缩小，本次操作已停止`
    );
  }

  if (preparedFile.contentType === 'javascript') {
    validateJavaScriptContent(afterContent, preparedFile.relativePath);
    return;
  }
  if (preparedFile.contentType === 'json') {
    const parsedJson = validateJsonContent(afterContent, preparedFile.relativePath);
    if (
      preparedFile.relativePath === 'product.json' &&
      parsedJson.checksums !== undefined &&
      (!parsedJson.checksums ||
        typeof parsedJson.checksums !== 'object' ||
        Array.isArray(parsedJson.checksums))
    ) {
      throw new Error('product.json checksums 必须是对象');
    }
    return;
  }

  throw new Error(`${preparedFile.relativePath} 使用了未知内容类型`);
}

function validatePreparedFiles(preparedFiles) {
  for (const preparedFile of preparedFiles) {
    validatePreparedFile(preparedFile);
  }
}

module.exports = {
  decodeUtf8,
  validateJavaScriptContent,
  validateJsonContent,
  validatePreparedFile,
  validatePreparedFiles,
};
