const assert = require('node:assert/strict');
const test = require('node:test');
const {
  validateJavaScriptContent,
  validatePreparedFile,
} = require('../src/content-validator');

test('JavaScript 验证只编译而不执行代码', () => {
  delete globalThis.cursorI18nValidationSideEffect;
  validateJavaScriptContent(
    Buffer.from(
      'globalThis.cursorI18nValidationSideEffect = "executed";\n',
      'utf8'
    ),
    'workbench.desktop.main.js'
  );

  assert.equal(globalThis.cursorI18nValidationSideEffect, undefined);
});

test('内容验证拒绝语法错误、无效 UTF-8 和异常缩小', () => {
  assert.throws(
    () =>
      validateJavaScriptContent(
        Buffer.from('function broken( {', 'utf8'),
        'workbench.desktop.main.js'
      ),
    /JavaScript 语法无效/
  );
  assert.throws(
    () =>
      validateJavaScriptContent(
        Buffer.from([0xc3, 0x28]),
        'workbench.desktop.main.js'
      ),
    /不是有效 UTF-8/
  );
  assert.throws(
    () =>
      validatePreparedFile({
        relativePath: 'workbench.desktop.main.js',
        contentType: 'javascript',
        beforeContent: Buffer.from('const original = "long enough";\n', 'utf8'),
        afterContent: Buffer.from('x', 'utf8'),
      }),
    /异常缩小/
  );
});

test('product.json 验证要求有效对象和 checksums 对象', () => {
  assert.throws(
    () =>
      validatePreparedFile({
        relativePath: 'product.json',
        contentType: 'json',
        beforeContent: Buffer.from('{"checksums":{}}', 'utf8'),
        afterContent: Buffer.from('{"checksums":[]}', 'utf8'),
      }),
    /checksums 必须是对象/
  );
  assert.throws(
    () =>
      validatePreparedFile({
        relativePath: 'product.json',
        contentType: 'json',
        beforeContent: Buffer.from('{"checksums":{}}', 'utf8'),
        afterContent: Buffer.from('{invalid}', 'utf8'),
      }),
    /JSON 无效/
  );
});
