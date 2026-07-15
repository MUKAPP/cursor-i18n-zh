const assert = require('node:assert/strict');
const crypto = require('crypto');
const test = require('node:test');
const {
  CHECKSUM_ENCODINGS,
  inferChecksumFormat,
  updateProductChecksums,
} = require('../src/hash');

const ORIGINAL_CONTENT = Buffer.from('console.log("original");\r\n', 'utf8');
const UPDATED_CONTENT = Buffer.from('console.log("translated");\r\n', 'utf8');
const GLASS_RELATIVE_PATH =
  'out/vs/workbench/workbench.glass.main.js';

function createChecksum(algorithm, encodingName, content = ORIGINAL_CONTENT) {
  const encoding = CHECKSUM_ENCODINGS.find(
    (candidateEncoding) => candidateEncoding.name === encodingName
  );
  const digestBuffer = crypto.createHash(algorithm).update(content).digest();
  return encoding.encode(digestBuffer);
}

test('动态 checksum 保留原算法和编码格式', async (testContext) => {
  const formats = [
    ['md5', 'hex-lowercase'],
    ['sha1', 'hex-uppercase'],
    ['sha256', 'base64-padded'],
    ['sha384', 'base64-unpadded'],
    ['sha512', 'base64url-unpadded'],
  ];

  for (const [algorithm, encodingName] of formats) {
    await testContext.test(`${algorithm} ${encodingName}`, () => {
      const checksumKey = 'vs/workbench/workbench.glass.main.js';
      const productJson = {
        checksums: {
          [checksumKey]: createChecksum(algorithm, encodingName),
        },
      };
      const result = updateProductChecksums(
        Buffer.from(JSON.stringify(productJson), 'utf8'),
        [
          {
            relativePath: GLASS_RELATIVE_PATH,
            originalContent: ORIGINAL_CONTENT,
            updatedContent: UPDATED_CONTENT,
          },
        ]
      );
      const updatedProductJson = JSON.parse(result.content);

      assert.equal(
        updatedProductJson.checksums[checksumKey],
        createChecksum(algorithm, encodingName, UPDATED_CONTENT)
      );
      assert.deepEqual(result.matchedChecksumKeys, [checksumKey]);
    });
  }
});

test('动态 checksum 报告没有对应条目的修改文件', () => {
  const result = updateProductChecksums(
    Buffer.from(JSON.stringify({ checksums: {} }), 'utf8'),
    [
      {
        relativePath: GLASS_RELATIVE_PATH,
        originalContent: ORIGINAL_CONTENT,
        updatedContent: UPDATED_CONTENT,
      },
    ]
  );

  assert.deepEqual(result.matchedChecksumKeys, []);
  assert.deepEqual(result.untrackedFiles, [GLASS_RELATIVE_PATH]);
});

test('product.json 没有 checksums 时只报告内容实际变化的文件', () => {
  const result = updateProductChecksums(
    Buffer.from(JSON.stringify({ nameShort: 'Cursor' }), 'utf8'),
    [
      {
        relativePath: GLASS_RELATIVE_PATH,
        originalContent: ORIGINAL_CONTENT,
        updatedContent: ORIGINAL_CONTENT,
      },
      {
        relativePath: 'out/vs/workbench/workbench.desktop.main.js',
        originalContent: ORIGINAL_CONTENT,
        updatedContent: UPDATED_CONTENT,
      },
    ]
  );

  assert.deepEqual(result.matchedChecksumKeys, []);
  assert.deepEqual(result.untrackedFiles, [
    'out/vs/workbench/workbench.desktop.main.js',
  ]);
});

test('动态 checksum 拒绝路径歧义和无法重现的旧值', () => {
  const duplicatedProductJson = {
    checksums: {
      'vs/workbench/workbench.glass.main.js': createChecksum(
        'sha256',
        'base64-unpadded'
      ),
      'out/vs/workbench/workbench.glass.main.js': createChecksum(
        'sha256',
        'base64-unpadded'
      ),
    },
  };
  const modifiedFiles = [
    {
      relativePath: GLASS_RELATIVE_PATH,
      originalContent: ORIGINAL_CONTENT,
      updatedContent: UPDATED_CONTENT,
    },
  ];

  assert.throws(
    () =>
      updateProductChecksums(
        Buffer.from(JSON.stringify(duplicatedProductJson), 'utf8'),
        modifiedFiles
      ),
    /多个 checksum 条目/
  );
  assert.throws(
    () => inferChecksumFormat(ORIGINAL_CONTENT, 'not-a-real-checksum'),
    /无法用原始文件重现/
  );
});
