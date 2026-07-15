const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const {
  applyWriteRequest,
  calculateSha256,
  detectLinuxCursorStatus,
  parseWriteRequest,
  replaceFileAtomically,
} = require('../src/elevated-helper');
const { createWriteRequest } = require('../src/installation-writer');
const {
  createCursorInstallation,
  createTemporaryDirectory,
  removeTemporaryDirectory,
} = require('./helpers');

function createFileRequest(relativePath, content, expectedContent = 'original') {
  const contentBuffer = Buffer.from(content, 'utf8');
  return {
    relativePath,
    expectedSha256: calculateSha256(Buffer.from(expectedContent, 'utf8')),
    contentSha256: calculateSha256(contentBuffer),
    contentBase64: contentBuffer.toString('base64'),
  };
}

test('提权协议拒绝未知字段、越界路径和重复目标', async (testContext) => {
  const validRequest = {
    protocolVersion: 1,
    operation: 'replace-installation-files',
    appPath: '/usr/share/cursor/resources/app',
    files: [
      createFileRequest(
        'out/vs/workbench/workbench.desktop.main.js',
        'translated'
      ),
    ],
  };

  await testContext.test('拒绝未知顶层字段', () => {
    assert.throws(
      () => parseWriteRequest(JSON.stringify({ ...validRequest, command: 'id' })),
      /未知字段/
    );
  });

  await testContext.test('拒绝允许列表之外的路径', () => {
    const invalidRequest = {
      ...validRequest,
      files: [createFileRequest('../../etc/passwd', 'translated')],
    };
    assert.throws(
      () => parseWriteRequest(JSON.stringify(invalidRequest)),
      /不允许写入目标路径/
    );
  });

  await testContext.test('拒绝重复目标', () => {
    const duplicateRequest = {
      ...validRequest,
      files: [validRequest.files[0], validRequest.files[0]],
    };
    assert.throws(
      () => parseWriteRequest(JSON.stringify(duplicateRequest)),
      /重复目标/
    );
  });

  await testContext.test('拒绝摘要不匹配的新内容', () => {
    const invalidHashRequest = structuredClone(validRequest);
    invalidHashRequest.files[0].contentSha256 = '0'.repeat(64);
    assert.throws(
      () => parseWriteRequest(JSON.stringify(invalidHashRequest)),
      /新内容摘要不匹配/
    );
  });
});

test('helper 只允许明确配置的系统 Cursor 安装根目录', () => {
  const rootDirectory = createTemporaryDirectory('cursor-i18n-helper-root-');
  const appPath = createCursorInstallation(rootDirectory);
  const desktopPath = path.join(
    appPath,
    'out/vs/workbench/workbench.desktop.main.js'
  );
  const request = parseWriteRequest(
    JSON.stringify(
      createWriteRequest(appPath, [
        {
          relativePath: 'out/vs/workbench/workbench.desktop.main.js',
          content: 'console.log("已汉化");\n',
        },
      ])
    )
  );

  try {
    assert.throws(
      () => applyWriteRequest(request, { skipProcessCheck: true }),
      /不允许提权写入此 Cursor 安装目录/
    );
    assert.match(fs.readFileSync(desktopPath, 'utf8'), /Cursor/);
  } finally {
    removeTemporaryDirectory(rootDirectory);
  }
});

test('helper 在写入前校验所有旧内容摘要', () => {
  const rootDirectory = createTemporaryDirectory('cursor-i18n-helper-hash-');
  const appPath = createCursorInstallation(rootDirectory);
  const desktopPath = path.join(
    appPath,
    'out/vs/workbench/workbench.desktop.main.js'
  );
  const writeRequest = createWriteRequest(appPath, [
    {
      relativePath: 'out/vs/workbench/workbench.desktop.main.js',
      content: 'console.log("已汉化");\n',
    },
  ]);
  const request = parseWriteRequest(JSON.stringify(writeRequest));

  try {
    fs.writeFileSync(desktopPath, 'console.log("外部更新");\n', 'utf8');
    assert.throws(
      () =>
        applyWriteRequest(request, {
          allowedAppPaths: [appPath],
          skipOwnershipCheck: true,
          skipProcessCheck: true,
        }),
      /目标文件已发生变化/
    );
    assert.match(fs.readFileSync(desktopPath, 'utf8'), /外部更新/);
  } finally {
    removeTemporaryDirectory(rootDirectory);
  }
});

test('helper 拒绝目标文件符号链接', () => {
  const rootDirectory = createTemporaryDirectory('cursor-i18n-helper-link-');
  const appPath = createCursorInstallation(rootDirectory);
  const desktopPath = path.join(
    appPath,
    'out/vs/workbench/workbench.desktop.main.js'
  );
  const linkedContentPath = path.join(rootDirectory, 'linked-content.js');

  try {
    fs.writeFileSync(linkedContentPath, 'console.log("外部文件");\n', 'utf8');
    fs.unlinkSync(desktopPath);
    fs.symlinkSync(linkedContentPath, desktopPath);
    const request = parseWriteRequest(
      JSON.stringify(
        createWriteRequest(appPath, [
          {
            relativePath: 'out/vs/workbench/workbench.desktop.main.js',
            content: 'console.log("已汉化");\n',
          },
        ])
      )
    );

    assert.throws(
      () =>
        applyWriteRequest(request, {
          allowedAppPaths: [appPath],
          skipOwnershipCheck: true,
          skipProcessCheck: true,
        }),
      /目标不是普通文件/
    );
    assert.match(fs.readFileSync(linkedContentPath, 'utf8'), /外部文件/);
  } finally {
    removeTemporaryDirectory(rootDirectory);
  }
});

test('helper 多文件提交失败时回滚已写入文件', () => {
  const rootDirectory = createTemporaryDirectory('cursor-i18n-helper-rollback-');
  const appPath = createCursorInstallation(rootDirectory);
  const desktopPath = path.join(
    appPath,
    'out/vs/workbench/workbench.desktop.main.js'
  );
  const productPath = path.join(appPath, 'product.json');
  const originalDesktopContent = fs.readFileSync(desktopPath);
  const originalProductContent = fs.readFileSync(productPath);
  const request = parseWriteRequest(
    JSON.stringify(
      createWriteRequest(appPath, [
        {
          relativePath: 'out/vs/workbench/workbench.desktop.main.js',
          content: 'console.log("已汉化");\n',
        },
        {
          relativePath: 'product.json',
          content: '{"nameShort":"Cursor translated"}\n',
        },
      ])
    )
  );
  let replacementCallCount = 0;

  try {
    assert.throws(
      () =>
        applyWriteRequest(request, {
          allowedAppPaths: [appPath],
          skipOwnershipCheck: true,
          skipProcessCheck: true,
          replaceFile(targetPath, content, metadata, options) {
            replacementCallCount += 1;
            if (replacementCallCount === 2) {
              throw new Error('模拟第二个文件写入失败');
            }
            replaceFileAtomically(targetPath, content, metadata, options);
          },
        }),
      /已回滚/
    );
    assert.deepEqual(fs.readFileSync(desktopPath), originalDesktopContent);
    assert.deepEqual(fs.readFileSync(productPath), originalProductContent);
  } finally {
    removeTemporaryDirectory(rootDirectory);
  }
});

test('helper 默认拒绝普通用户可替换的目标父目录', () => {
  const rootDirectory = createTemporaryDirectory('cursor-i18n-helper-trust-');
  const appPath = createCursorInstallation(rootDirectory);
  const request = parseWriteRequest(
    JSON.stringify(
      createWriteRequest(appPath, [
        {
          relativePath: 'out/vs/workbench/workbench.desktop.main.js',
          content: 'console.log("已汉化");\n',
        },
      ])
    )
  );

  try {
    assert.throws(
      () =>
        applyWriteRequest(request, {
          allowedAppPaths: [appPath],
          skipProcessCheck: true,
        }),
      /父目录必须由 root 所有|父路径不是可信目录/
    );
  } finally {
    removeTemporaryDirectory(rootDirectory);
  }
});

test('helper 在 rename 后持久化失败时回滚当前文件', () => {
  const rootDirectory = createTemporaryDirectory('cursor-i18n-helper-fsync-');
  const appPath = createCursorInstallation(rootDirectory);
  const desktopPath = path.join(
    appPath,
    'out/vs/workbench/workbench.desktop.main.js'
  );
  const originalDesktopContent = fs.readFileSync(desktopPath);
  const request = parseWriteRequest(
    JSON.stringify(
      createWriteRequest(appPath, [
        {
          relativePath: 'out/vs/workbench/workbench.desktop.main.js',
          content: 'console.log("已汉化");\n',
        },
      ])
    )
  );
  let replacementCallCount = 0;

  try {
    assert.throws(
      () =>
        applyWriteRequest(request, {
          allowedAppPaths: [appPath],
          skipOwnershipCheck: true,
          skipProcessCheck: true,
          replaceFile(targetPath, content) {
            replacementCallCount += 1;
            fs.writeFileSync(targetPath, content);
            if (replacementCallCount === 1) {
              const persistenceError = new Error('模拟目录 fsync 失败');
              persistenceError.targetReplaced = true;
              throw persistenceError;
            }
          },
        }),
      /已回滚/
    );
    assert.equal(replacementCallCount, 2);
    assert.deepEqual(fs.readFileSync(desktopPath), originalDesktopContent);
  } finally {
    removeTemporaryDirectory(rootDirectory);
  }
});

test('helper 再次检测到 Cursor 进程时拒绝写入', () => {
  const rootDirectory = createTemporaryDirectory('cursor-i18n-helper-process-');
  const appPath = createCursorInstallation(rootDirectory);
  const desktopPath = path.join(
    appPath,
    'out/vs/workbench/workbench.desktop.main.js'
  );
  const cursorExecutablePath = path.join(rootDirectory, 'cursor');
  const procDirectory = path.join(rootDirectory, 'proc');
  const processDirectory = path.join(procDirectory, '4321');

  try {
    fs.writeFileSync(cursorExecutablePath, '', 'utf8');
    fs.mkdirSync(processDirectory, { recursive: true });
    fs.writeFileSync(path.join(processDirectory, 'comm'), 'Cursor\n', 'utf8');
    fs.symlinkSync(cursorExecutablePath, path.join(processDirectory, 'exe'));
    const request = parseWriteRequest(
      JSON.stringify(
        createWriteRequest(appPath, [
          {
            relativePath: 'out/vs/workbench/workbench.desktop.main.js',
            content: 'console.log("已汉化");\n',
          },
        ])
      )
    );

    assert.throws(
      () =>
        applyWriteRequest(request, {
          allowedAppPaths: [appPath],
          procDirectory,
          currentProcessId: 9999,
        }),
      /Cursor 仍在运行/
    );
    assert.match(fs.readFileSync(desktopPath, 'utf8'), /Cursor/);
  } finally {
    removeTemporaryDirectory(rootDirectory);
  }
});

test('helper 无法确认疑似 Cursor 进程时返回 unknown', () => {
  const permissionError = new Error('无法读取进程可执行文件');
  permissionError.code = 'EACCES';
  const result = detectLinuxCursorStatus(
    '/usr/share/cursor/resources/app',
    {
      currentProcessId: 9999,
      fileSystem: {
        readdirSync() {
          return ['4321'];
        },
        readFileSync(filePath) {
          if (filePath.endsWith(path.join('4321', 'comm'))) {
            throw permissionError;
          }
          throw new Error(`意外读取: ${filePath}`);
        },
        realpathSync(filePath) {
          if (filePath.endsWith(path.join('4321', 'exe'))) {
            throw permissionError;
          }
          return filePath;
        },
      },
      procDirectory: '/proc',
    }
  );

  assert.equal(result.status, 'unknown');
});
