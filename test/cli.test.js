const assert = require('node:assert/strict');
const test = require('node:test');
const { parseCommandLine } = require('../src/cli');

test('解析显式 Cursor 安装路径', () => {
  assert.deepEqual(
    parseCommandLine(['status', '--app-path', '/usr/share/cursor/resources/app']),
    {
      command: 'status',
      appPath: '/usr/share/cursor/resources/app',
    }
  );
});

test('拒绝未知选项和多余参数', () => {
  assert.throws(() => parseCommandLine(['status', '--unknown']), /未知选项/);
  assert.throws(() => parseCommandLine(['status', 'extra']), /多余的位置参数/);
});

test('拒绝在不使用安装目录的命令中指定 app-path', () => {
  assert.throws(
    () => parseCommandLine(['locale', '--app-path=/tmp/resources/app']),
    /不支持 --app-path/
  );
  assert.throws(
    () => parseCommandLine(['help', '--app-path=/tmp/resources/app']),
    /不支持 --app-path/
  );
});

test('拒绝重复或缺少值的 app-path', () => {
  assert.throws(
    () => parseCommandLine(['status', '--app-path=/one', '--app-path=/two']),
    /只能指定一次/
  );
  assert.throws(
    () => parseCommandLine(['status', '--app-path']),
    /必须提供/
  );
});
