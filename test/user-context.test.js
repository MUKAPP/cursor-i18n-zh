const assert = require('node:assert/strict');
const path = require('path');
const test = require('node:test');
const { resolveCursorUserDirectory } = require('../src/user-context');

test('Linux 使用 XDG_CONFIG_HOME 解析 Cursor 用户目录', () => {
  const userDirectory = resolveCursorUserDirectory({
    platform: 'linux',
    homeDirectory: '/home/tester',
    environment: { XDG_CONFIG_HOME: '/data/config' },
  });

  assert.equal(userDirectory, path.join('/data/config', 'Cursor', 'User'));
});

test('Linux 未设置 XDG_CONFIG_HOME 时使用 ~/.config', () => {
  const userDirectory = resolveCursorUserDirectory({
    platform: 'linux',
    homeDirectory: '/home/tester',
    environment: {},
  });

  assert.equal(userDirectory, path.join('/home/tester', '.config', 'Cursor', 'User'));
});

test('Linux 忽略相对的 XDG_CONFIG_HOME', () => {
  const userDirectory = resolveCursorUserDirectory({
    platform: 'linux',
    homeDirectory: '/home/tester',
    environment: { XDG_CONFIG_HOME: 'relative-config' },
  });

  assert.equal(userDirectory, '/home/tester/.config/Cursor/User');
});

test('macOS 和 Windows 使用各自标准用户目录', () => {
  assert.equal(
    resolveCursorUserDirectory({
      platform: 'darwin',
      homeDirectory: '/Users/tester',
      environment: {},
    }),
    '/Users/tester/Library/Application Support/Cursor/User'
  );
  assert.equal(
    resolveCursorUserDirectory({
      platform: 'win32',
      homeDirectory: 'C:\\Users\\tester',
      environment: { APPDATA: 'C:\\Users\\tester\\AppData\\Roaming' },
    }),
    'C:\\Users\\tester\\AppData\\Roaming\\Cursor\\User'
  );
});
