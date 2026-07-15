'use strict';

const { TextDecoder } = require('util');
const vm = require('vm');

const strictUtf8Decoder = new TextDecoder('utf-8', { fatal: true });

function decodeUtf8(content, relativePath) {
  try {
    return strictUtf8Decoder.decode(Buffer.from(content));
  } catch (error) {
    throw new Error(`${relativePath} 不是有效 UTF-8: ${error.message}`);
  }
}

function validateJavaScriptContent(content, relativePath) {
  const sourceCode = decodeUtf8(content, relativePath);
  try {
    new vm.Script(sourceCode, { filename: relativePath });
  } catch (error) {
    throw new Error(`${relativePath} JavaScript 语法无效: ${error.message}`);
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
