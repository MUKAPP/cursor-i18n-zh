'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function fsyncDirectory(directoryPath, options = {}) {
  const fileSystem = options.fileSystem || fs;
  const platform = options.platform || process.platform;
  if (platform === 'win32') {
    return;
  }

  let directoryDescriptor;

  try {
    directoryDescriptor = fileSystem.openSync(directoryPath, 'r');
    fileSystem.fsyncSync(directoryDescriptor);
  } finally {
    if (directoryDescriptor !== undefined) {
      fileSystem.closeSync(directoryDescriptor);
    }
  }
}

function writeFileAtomically(filePath, content, options = {}) {
  const fileSystem = options.fileSystem || fs;
  const directoryPath = path.dirname(filePath);
  const temporaryPath = path.join(
    directoryPath,
    `.${path.basename(filePath)}.${process.pid}-${crypto.randomBytes(8).toString('hex')}.tmp`
  );
  const mode = options.mode || 0o600;
  let fileDescriptor;

  fileSystem.mkdirSync(directoryPath, { recursive: true, mode: 0o700 });
  try {
    fileDescriptor = fileSystem.openSync(
      temporaryPath,
      fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY,
      mode
    );
    fileSystem.writeFileSync(fileDescriptor, content);
    fileSystem.fsyncSync(fileDescriptor);
    fileSystem.closeSync(fileDescriptor);
    fileDescriptor = undefined;
    fileSystem.renameSync(temporaryPath, filePath);
    fsyncDirectory(directoryPath, {
      fileSystem,
      platform: options.platform,
    });
  } catch (error) {
    if (fileDescriptor !== undefined) {
      try {
        fileSystem.closeSync(fileDescriptor);
      } catch {
        // 保留原始写入错误。
      }
    }
    try {
      fileSystem.unlinkSync(temporaryPath);
    } catch {
      // 临时文件可能尚未创建或已完成 rename。
    }
    throw error;
  }
}

function writeJsonAtomically(filePath, value, options = {}) {
  const serializedValue = `${JSON.stringify(value, null, 2)}\n`;
  writeFileAtomically(filePath, serializedValue, options);
}

module.exports = {
  fsyncDirectory,
  writeFileAtomically,
  writeJsonAtomically,
};
