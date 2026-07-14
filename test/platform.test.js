const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const {
  buildPlatformCandidates,
  detectCursorPath,
  detectLinuxCursorProcesses,
  isStateForInstallation,
  prepareAppForWrite,
  validateCursorInstallation,
} = require('../src/platform');
const {
  createCursorInstallation,
  createTemporaryDirectory,
  removeTemporaryDirectory,
} = require('./helpers');

test('Linux 候选目录包含常见系统安装位置', () => {
  const candidates = buildPlatformCandidates({
    platform: 'linux',
    homeDirectory: '/home/tester',
    environment: {},
  });

  assert.ok(candidates.includes('/usr/share/cursor/resources/app'));
  assert.ok(candidates.includes('/usr/lib/cursor/resources/app'));
  assert.ok(candidates.includes('/opt/Cursor/resources/app'));
});

test('显式安装路径优先于环境变量并经过严格验证', () => {
  const rootDirectory = createTemporaryDirectory('cursor-i18n-platform-');
  const explicitAppPath = createCursorInstallation(
    path.join(rootDirectory, 'explicit')
  );
  const environmentAppPath = createCursorInstallation(
    path.join(rootDirectory, 'environment')
  );

  try {
    const paths = detectCursorPath({
      platform: 'linux',
      appPath: explicitAppPath,
      environment: { CURSOR_APP_PATH: environmentAppPath },
      executeFileSync: () => {
        throw new Error('测试中不解析系统可执行文件');
      },
    });

    assert.equal(paths.appPath, path.resolve(explicitAppPath));
    assert.equal(paths.source, 'command-line');
  } finally {
    removeTemporaryDirectory(rootDirectory);
  }
});

test('环境变量安装路径优先于自动检测', () => {
  const rootDirectory = createTemporaryDirectory('cursor-i18n-environment-');
  const environmentAppPath = createCursorInstallation(rootDirectory);

  try {
    const paths = detectCursorPath({
      platform: 'linux',
      environment: { CURSOR_APP_PATH: environmentAppPath },
      executeFileSync: () => {
        throw new Error('环境变量应在可执行文件检测之前生效');
      },
    });

    assert.equal(paths.appPath, path.resolve(environmentAppPath));
    assert.equal(paths.source, 'environment');
  } finally {
    removeTemporaryDirectory(rootDirectory);
  }
});

test('可以从 Cursor 可执行文件位置反查安装目录', () => {
  const rootDirectory = createTemporaryDirectory('cursor-i18n-executable-');
  const appPath = createCursorInstallation(rootDirectory);
  const executablePath = path.join(rootDirectory, 'cursor');
  fs.writeFileSync(executablePath, '', 'utf8');

  try {
    const paths = detectCursorPath({
      platform: 'linux',
      environment: {},
      homeDirectory: path.join(rootDirectory, 'home'),
      executeFileSync(locator, argumentsList) {
        assert.equal(locator, 'which');
        assert.deepEqual(argumentsList, ['cursor']);
        return `${executablePath}\n`;
      },
    });

    assert.equal(paths.appPath, path.resolve(appPath));
    assert.equal(paths.source, 'executable');
  } finally {
    removeTemporaryDirectory(rootDirectory);
  }
});

test('缺少 product.json 或 workbench 目录时拒绝安装路径', () => {
  const rootDirectory = createTemporaryDirectory('cursor-i18n-invalid-');

  try {
    fs.writeFileSync(
      path.join(rootDirectory, 'package.json'),
      JSON.stringify({ version: '3.11.13' }),
      'utf8'
    );
    const validation = validateCursorInstallation(rootDirectory);
    assert.equal(validation.valid, false);
  } finally {
    removeTemporaryDirectory(rootDirectory);
  }
});

test('workbench 目录存在但缺少 desktop 主目标时拒绝安装路径', () => {
  const rootDirectory = createTemporaryDirectory('cursor-i18n-no-desktop-');
  const appPath = createCursorInstallation(rootDirectory);
  const desktopWorkbenchPath = path.join(
    appPath,
    'out',
    'vs',
    'workbench',
    'workbench.desktop.main.js'
  );

  try {
    fs.unlinkSync(desktopWorkbenchPath);
    const validation = validateCursorInstallation(appPath);
    assert.equal(validation.valid, false);
    assert.match(validation.reason, /workbench\.desktop\.main\.js/);
  } finally {
    removeTemporaryDirectory(rootDirectory);
  }
});

test('安装路径通过符号链接指定时返回真实路径', () => {
  const rootDirectory = createTemporaryDirectory('cursor-i18n-symlink-');
  const realAppPath = createCursorInstallation(path.join(rootDirectory, 'real'));
  const linkedAppPath = path.join(rootDirectory, 'linked-app');

  try {
    fs.symlinkSync(realAppPath, linkedAppPath, 'dir');
    const paths = detectCursorPath({
      platform: 'linux',
      appPath: linkedAppPath,
      environment: {},
    });

    assert.equal(paths.appPath, fs.realpathSync(realAppPath));
  } finally {
    removeTemporaryDirectory(rootDirectory);
  }
});

test('Linux 进程检测只匹配所选 Cursor 安装中的可执行文件', () => {
  const rootDirectory = createTemporaryDirectory('cursor-i18n-proc-');
  const appPath = path.join(rootDirectory, 'cursor', 'resources', 'app');
  const procDirectory = path.join(rootDirectory, 'proc');
  fs.mkdirSync(path.join(procDirectory, '101'), { recursive: true });
  fs.mkdirSync(path.join(procDirectory, '202'), { recursive: true });

  const fakeFileSystem = {
    readdirSync(directoryPath) {
      assert.equal(directoryPath, procDirectory);
      return ['101', '202', 'self', 'cursor-i18n-zh'];
    },
    realpathSync(executableLinkPath) {
      if (executableLinkPath.endsWith(path.join('101', 'exe'))) {
        return path.join(rootDirectory, 'cursor', 'cursor');
      }
      if (executableLinkPath.endsWith(path.join('202', 'exe'))) {
        return '/usr/bin/node';
      }
      throw new Error('进程已退出');
    },
  };

  try {
    const result = detectLinuxCursorProcesses(
      { appPath },
      { fileSystem: fakeFileSystem, procDirectory, currentProcessId: 999 }
    );
    assert.equal(result.status, 'running');
    assert.deepEqual(
      result.processes.map((processInfo) => processInfo.pid),
      [101]
    );
  } finally {
    removeTemporaryDirectory(rootDirectory);
  }
});

test('Linux 进程目录不可读时返回 unknown', () => {
  const result = detectLinuxCursorProcesses(
    { appPath: '/usr/share/cursor/resources/app' },
    {
      fileSystem: {
        readdirSync() {
          throw new Error('权限不足');
        },
      },
      procDirectory: '/proc',
    }
  );

  assert.equal(result.status, 'unknown');
  assert.match(result.reason, /权限不足/);
});

test('疑似 Cursor 进程的 exe 无权读取时返回 unknown', () => {
  const permissionError = new Error('不允许读取进程可执行文件');
  permissionError.code = 'EACCES';

  const result = detectLinuxCursorProcesses(
    { appPath: '/usr/share/cursor/resources/app' },
    {
      fileSystem: {
        readdirSync() {
          return ['101'];
        },
        readFileSync(filePath) {
          if (filePath.endsWith(path.join('101', 'comm'))) return 'Cursor\n';
          throw new Error(`意外读取: ${filePath}`);
        },
        realpathSync(filePath) {
          if (filePath.endsWith(path.join('101', 'exe'))) throw permissionError;
          return filePath;
        },
      },
      procDirectory: '/proc',
      currentProcessId: 999,
    }
  );

  assert.equal(result.status, 'unknown');
  assert.deepEqual(result.processes.map((processInfo) => processInfo.pid), [101]);
});

test('汉化状态只属于对应的 Cursor 安装', () => {
  const rootDirectory = createTemporaryDirectory('cursor-i18n-state-');
  const firstAppPath = createCursorInstallation(path.join(rootDirectory, 'first'));
  const secondAppPath = createCursorInstallation(path.join(rootDirectory, 'second'));

  try {
    const state = { appPath: firstAppPath, localizedVersion: '3.11.13' };
    assert.equal(isStateForInstallation(state, firstAppPath), true);
    assert.equal(isStateForInstallation(state, secondAppPath), false);
  } finally {
    removeTemporaryDirectory(rootDirectory);
  }
});

test('macOS 写入准备通过参数数组传递应用路径', () => {
  const rootDirectory = createTemporaryDirectory('cursor-i18n-command-');
  const appBundlePath = path.join(rootDirectory, 'Cursor $(unsafe) `name`.app');
  const calls = [];

  try {
    fs.mkdirSync(appBundlePath, { recursive: true });
    prepareAppForWrite(appBundlePath, [], {
      platform: 'darwin',
      executeFileSync(command, argumentsList) {
        calls.push({ command, argumentsList });
      },
    });

    assert.deepEqual(calls, [
      { command: 'xattr', argumentsList: ['-cr', appBundlePath] },
    ]);
  } finally {
    removeTemporaryDirectory(rootDirectory);
  }
});
