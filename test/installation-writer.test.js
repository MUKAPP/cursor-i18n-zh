const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const {
  applyInstallationReplacements,
  assertTrustedRootFile,
  createWriteRequest,
  invokeElevatedHelper,
} = require('../src/installation-writer');
const {
  createCursorInstallation,
  createTemporaryDirectory,
  removeTemporaryDirectory,
} = require('./helpers');

test('写入请求只包含固定相对路径、内容和摘要', () => {
  const rootDirectory = createTemporaryDirectory('cursor-i18n-writer-request-');
  const appPath = createCursorInstallation(rootDirectory);

  try {
    const writeRequest = createWriteRequest(appPath, [
      {
        relativePath: 'out/vs/workbench/workbench.desktop.main.js',
        content: 'console.log("已汉化");\n',
        backupPath: '/home/tester/.cursor-i18n-zh/backups/private.backup',
      },
    ]);

    assert.deepEqual(Object.keys(writeRequest).sort(), [
      'appPath',
      'files',
      'operation',
      'protocolVersion',
    ]);
    assert.deepEqual(Object.keys(writeRequest.files[0]).sort(), [
      'contentBase64',
      'contentSha256',
      'expectedSha256',
      'relativePath',
    ]);
    assert.equal(JSON.stringify(writeRequest).includes('/home/tester'), false);
  } finally {
    removeTemporaryDirectory(rootDirectory);
  }
});

test('可写安装目录直接提交而不调用 pkexec', () => {
  const rootDirectory = createTemporaryDirectory('cursor-i18n-writer-direct-');
  const appPath = createCursorInstallation(rootDirectory);
  const desktopPath = path.join(
    appPath,
    'out/vs/workbench/workbench.desktop.main.js'
  );

  try {
    const result = applyInstallationReplacements(
      appPath,
      [
        {
          relativePath: 'out/vs/workbench/workbench.desktop.main.js',
          content: 'console.log("已汉化");\n',
        },
      ],
      {
        needsElevation: false,
        spawnProcessSync() {
          throw new Error('可写安装目录不应调用 pkexec');
        },
      }
    );

    assert.deepEqual(result.writtenFiles, [
      'out/vs/workbench/workbench.desktop.main.js',
    ]);
    assert.match(fs.readFileSync(desktopPath, 'utf8'), /已汉化/);
  } finally {
    removeTemporaryDirectory(rootDirectory);
  }
});

test('提交安装文件前重新确认 Cursor 未运行', () => {
  const rootDirectory = createTemporaryDirectory('cursor-i18n-writer-process-');
  const appPath = createCursorInstallation(rootDirectory);
  const desktopPath = path.join(
    appPath,
    'out/vs/workbench/workbench.desktop.main.js'
  );

  try {
    assert.throws(
      () =>
        applyInstallationReplacements(
          appPath,
          [
            {
              relativePath: 'out/vs/workbench/workbench.desktop.main.js',
              content: 'console.log("已汉化");\n',
            },
          ],
          {
            ensureNotRunning() {
              throw new Error('检测到 Cursor 重新启动');
            },
            needsElevation: false,
          }
        ),
      /Cursor 重新启动/
    );
    assert.match(fs.readFileSync(desktopPath, 'utf8'), /Cursor/);
  } finally {
    removeTemporaryDirectory(rootDirectory);
  }
});

test('写入请求拒绝把竞态后的内容作为新基线', () => {
  const rootDirectory = createTemporaryDirectory('cursor-i18n-writer-race-');
  const appPath = createCursorInstallation(rootDirectory);
  const desktopPath = path.join(
    appPath,
    'out/vs/workbench/workbench.desktop.main.js'
  );
  const expectedSha256 = require('../src/elevated-helper').calculateSha256(
    fs.readFileSync(desktopPath)
  );

  try {
    fs.writeFileSync(desktopPath, 'console.log("外部更新");\n', 'utf8');
    assert.throws(
      () =>
        createWriteRequest(appPath, [
          {
            relativePath: 'out/vs/workbench/workbench.desktop.main.js',
            content: 'console.log("已汉化");\n',
            expectedSha256,
          },
        ]),
      /生成写入请求前已发生变化/
    );
    assert.match(fs.readFileSync(desktopPath, 'utf8'), /外部更新/);
  } finally {
    removeTemporaryDirectory(rootDirectory);
  }
});

test('Linux 提权调用使用参数数组和 stdin 请求', () => {
  const rootDirectory = createTemporaryDirectory('cursor-i18n-writer-pkexec-');
  const appPath = createCursorInstallation(rootDirectory);
  const writeRequest = createWriteRequest(appPath, [
    {
      relativePath: 'out/vs/workbench/workbench.desktop.main.js',
      content: 'console.log("已汉化");\n',
    },
  ]);
  const calls = [];

  try {
    const response = invokeElevatedHelper(writeRequest, {
      pkexecPath: '/trusted/pkexec',
      nodePath: '/trusted/node',
      helperPath: '/trusted/elevated-helper.js',
      skipTrustCheck: true,
      spawnProcessSync(command, argumentsList, spawnOptions) {
        calls.push({ command, argumentsList, spawnOptions });
        return {
          status: 0,
          stdout: JSON.stringify({
            ok: true,
            writtenFiles: [
              'out/vs/workbench/workbench.desktop.main.js',
            ],
          }),
          stderr: '',
        };
      },
    });

    assert.equal(response.ok, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].command, '/trusted/pkexec');
    assert.deepEqual(calls[0].argumentsList, [
      '/trusted/node',
      '/trusted/elevated-helper.js',
      '--stdio',
    ]);
    assert.deepEqual(JSON.parse(calls[0].spawnOptions.input), writeRequest);
    assert.equal(calls[0].spawnOptions.shell, undefined);
  } finally {
    removeTemporaryDirectory(rootDirectory);
  }
});

test('取消 pkexec 授权时返回明确错误', () => {
  assert.throws(
    () =>
      invokeElevatedHelper(
        {
          protocolVersion: 1,
          operation: 'replace-installation-files',
          appPath: '/usr/share/cursor/resources/app',
          files: [],
        },
        {
          skipTrustCheck: true,
          spawnProcessSync() {
            return { status: 126, stdout: '', stderr: '' };
          },
        }
      ),
    /管理员授权已取消/
  );
});

test('取消授权导致 EPIPE 时仍返回明确错误', () => {
  const writeRequest = {
    protocolVersion: 1,
    operation: 'replace-installation-files',
    appPath: '/usr/share/cursor/resources/app',
    files: [],
  };
  const brokenPipeError = Object.assign(new Error('write EPIPE'), {
    code: 'EPIPE',
  });

  assert.throws(
    () =>
      invokeElevatedHelper(writeRequest, {
        skipTrustCheck: true,
        spawnProcessSync() {
          return {
            status: 126,
            error: brokenPipeError,
            stdout: '',
            stderr: '',
          };
        },
      }),
    /管理员授权已取消/
  );

  assert.throws(
    () =>
      invokeElevatedHelper(writeRequest, {
        skipTrustCheck: true,
        spawnProcessSync() {
          return {
            status: null,
            error: brokenPipeError,
            stdout: '',
            stderr: '',
          };
        },
      }),
    /管理员授权已取消或提权进程提前退出/
  );
});

test('提权调用拒绝普通用户可写的 helper', () => {
  const rootDirectory = createTemporaryDirectory('cursor-i18n-writer-trust-');
  const helperPath = path.join(rootDirectory, 'elevated-helper.js');

  try {
    fs.writeFileSync(helperPath, '#!/usr/bin/node\n', { mode: 0o777 });
    assert.throws(
      () => assertTrustedRootFile(helperPath, '提权 helper'),
      /由 root 所有|父目录不可信|不能被组或其他用户写入/
    );
  } finally {
    removeTemporaryDirectory(rootDirectory);
  }
});

test('非 Linux 平台不尝试 pkexec 提权', () => {
  const rootDirectory = createTemporaryDirectory('cursor-i18n-writer-platform-');
  const appPath = createCursorInstallation(rootDirectory);

  try {
    assert.throws(
      () =>
        applyInstallationReplacements(
          appPath,
          [
            {
              relativePath: 'out/vs/workbench/workbench.desktop.main.js',
              content: 'console.log("已汉化");\n',
            },
          ],
          { needsElevation: true, platform: 'darwin' }
        ),
      /不支持受限 pkexec/
    );
  } finally {
    removeTemporaryDirectory(rootDirectory);
  }
});
