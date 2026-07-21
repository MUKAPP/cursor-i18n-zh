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
const AMBIGUOUS_BASE64_CONTENT = Buffer.from('checksum-vector-4', 'utf8');
const DISTINCT_BASE64_CONTENT = Buffer.from('checksum-vector-0', 'utf8');
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

test('动态 checksum 使用其他条目区分标准 Base64 与 Base64URL', async (testContext) => {
  const cases = [
    {
      encodingName: 'base64-unpadded',
      evidenceKey: 'vs/workbench/workbench.desktop.main.css',
    },
    {
      encodingName: 'base64url-unpadded',
      evidenceKey: 'vs/workbench/workbench.desktop.main.css',
    },
  ];

  for (const { encodingName, evidenceKey } of cases) {
    await testContext.test(encodingName, () => {
      const checksumKey = 'vs/workbench/workbench.glass.main.js';
      const productJson = {
        checksums: {
          [checksumKey]: createChecksum(
            'sha256',
            encodingName,
            AMBIGUOUS_BASE64_CONTENT
          ),
          [evidenceKey]: createChecksum(
            'sha256',
            encodingName,
            DISTINCT_BASE64_CONTENT
          ),
        },
      };
      const result = updateProductChecksums(
        Buffer.from(JSON.stringify(productJson), 'utf8'),
        [
          {
            relativePath: GLASS_RELATIVE_PATH,
            originalContent: AMBIGUOUS_BASE64_CONTENT,
            updatedContent: DISTINCT_BASE64_CONTENT,
          },
        ]
      );
      const updatedProductJson = JSON.parse(result.content);

      assert.equal(
        updatedProductJson.checksums[checksumKey],
        createChecksum('sha256', encodingName, DISTINCT_BASE64_CONTENT)
      );
    });
  }
});

test('动态 checksum 在编码证据缺失或冲突时继续安全停止', () => {
  const checksumKey = 'vs/workbench/workbench.glass.main.js';
  const ambiguousChecksum = createChecksum(
    'sha256',
    'base64-unpadded',
    AMBIGUOUS_BASE64_CONTENT
  );
  const modifiedFiles = [
    {
      relativePath: GLASS_RELATIVE_PATH,
      originalContent: AMBIGUOUS_BASE64_CONTENT,
      updatedContent: DISTINCT_BASE64_CONTENT,
    },
  ];

  assert.throws(
    () =>
      updateProductChecksums(
        Buffer.from(
          JSON.stringify({ checksums: { [checksumKey]: ambiguousChecksum } }),
          'utf8'
        ),
        modifiedFiles
      ),
    /编码格式存在歧义/
  );

  const productJsonWithConflictingEvidence = {
    checksums: {
      [checksumKey]: ambiguousChecksum,
      'standard-base64-evidence': createChecksum(
        'sha256',
        'base64-unpadded',
        DISTINCT_BASE64_CONTENT
      ),
      'base64url-evidence': createChecksum(
        'sha256',
        'base64url-unpadded',
        DISTINCT_BASE64_CONTENT
      ),
    },
  };
  assert.throws(
    () =>
      updateProductChecksums(
        Buffer.from(JSON.stringify(productJsonWithConflictingEvidence), 'utf8'),
        modifiedFiles
      ),
    /同时包含标准 Base64 与 Base64URL 特征/
  );
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
