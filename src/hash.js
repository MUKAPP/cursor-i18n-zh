const crypto = require('crypto');

const SUPPORTED_HASH_ALGORITHMS = [
  'md5',
  'sha1',
  'sha256',
  'sha384',
  'sha512',
];

const CHECKSUM_ENCODINGS = [
  {
    name: 'hex-lowercase',
    encode(digestBuffer) {
      return digestBuffer.toString('hex');
    },
  },
  {
    name: 'hex-uppercase',
    encode(digestBuffer) {
      return digestBuffer.toString('hex').toUpperCase();
    },
  },
  {
    name: 'base64-padded',
    encode(digestBuffer) {
      return digestBuffer.toString('base64');
    },
  },
  {
    name: 'base64-unpadded',
    encode(digestBuffer) {
      return digestBuffer.toString('base64').replace(/=+$/, '');
    },
  },
  {
    name: 'base64url-unpadded',
    encode(digestBuffer) {
      return digestBuffer.toString('base64url');
    },
  },
  {
    name: 'base64url-padded',
    encode(digestBuffer) {
      const value = digestBuffer.toString('base64url');
      return value.padEnd(Math.ceil(value.length / 4) * 4, '=');
    },
  },
];

function normalizeChecksumPath(filePath) {
  return filePath.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\//, '');
}

function buildChecksumPathCandidates(relativePath) {
  const normalizedPath = normalizeChecksumPath(relativePath);
  const candidates = new Set([normalizedPath]);
  if (normalizedPath.startsWith('out/')) {
    candidates.add(normalizedPath.slice('out/'.length));
  }
  return [...candidates];
}

function checksumKeyMatchesRelativePath(checksumKey, relativePath) {
  const normalizedChecksumKey = normalizeChecksumPath(checksumKey);
  return buildChecksumPathCandidates(relativePath).includes(normalizedChecksumKey);
}

function inferChecksumFormat(originalContent, existingChecksum) {
  if (typeof existingChecksum !== 'string' || existingChecksum.length === 0) {
    throw new Error('现有 checksum 不是非空字符串');
  }

  const matchingFormats = [];
  for (const algorithm of SUPPORTED_HASH_ALGORITHMS) {
    const digestBuffer = crypto.createHash(algorithm).update(originalContent).digest();
    for (const encoding of CHECKSUM_ENCODINGS) {
      if (encoding.encode(digestBuffer) === existingChecksum) {
        matchingFormats.push({ algorithm, encoding });
      }
    }
  }

  if (matchingFormats.length === 0) {
    throw new Error('无法用原始文件重现现有 checksum');
  }

  const algorithms = new Set(matchingFormats.map((format) => format.algorithm));
  if (algorithms.size !== 1) {
    throw new Error('现有 checksum 可由多种算法重现，无法安全确定格式');
  }

  return matchingFormats;
}

function getBase64EncodingFamily(encodingName) {
  if (encodingName.startsWith('base64url-')) {
    return 'base64url';
  }
  if (encodingName.startsWith('base64-')) {
    return 'base64';
  }
  return null;
}

function resolveBase64EncodingAmbiguity(matchingFormats, checksumValues) {
  const matchingFamilies = new Set(
    matchingFormats
      .map(({ encoding }) => getBase64EncodingFamily(encoding.name))
      .filter(Boolean)
  );
  if (!matchingFamilies.has('base64') || !matchingFamilies.has('base64url')) {
    return matchingFormats;
  }

  const stringChecksumValues = checksumValues.filter(
    (checksumValue) => typeof checksumValue === 'string'
  );
  const hasStandardBase64Evidence = stringChecksumValues.some((checksumValue) =>
    /[+/]/.test(checksumValue)
  );
  const hasBase64UrlEvidence = stringChecksumValues.some((checksumValue) =>
    /[-_]/.test(checksumValue)
  );

  if (hasStandardBase64Evidence && hasBase64UrlEvidence) {
    throw new Error(
      'product.json checksums 同时包含标准 Base64 与 Base64URL 特征，无法安全确定编码格式'
    );
  }
  if (!hasStandardBase64Evidence && !hasBase64UrlEvidence) {
    return matchingFormats;
  }

  const selectedFamily = hasStandardBase64Evidence ? 'base64' : 'base64url';
  return matchingFormats.filter(
    ({ encoding }) => getBase64EncodingFamily(encoding.name) === selectedFamily
  );
}

function encodeUpdatedChecksum(updatedContent, matchingFormats, checksumValues) {
  const resolvedFormats = resolveBase64EncodingAmbiguity(
    matchingFormats,
    checksumValues
  );
  const generatedChecksums = new Set(
    resolvedFormats.map(({ algorithm, encoding }) => {
      const digestBuffer = crypto.createHash(algorithm).update(updatedContent).digest();
      return encoding.encode(digestBuffer);
    })
  );

  if (generatedChecksums.size !== 1) {
    throw new Error('现有 checksum 编码格式存在歧义，无法安全生成新值');
  }

  return [...generatedChecksums][0];
}

function updateProductChecksums(productJsonContent, modifiedFiles) {
  const productJson = JSON.parse(productJsonContent);
  if (!productJson || typeof productJson !== 'object' || Array.isArray(productJson)) {
    throw new Error('product.json 根节点必须是对象');
  }

  const changedFiles = modifiedFiles.filter((modifiedFile) => {
    const originalContent = Buffer.from(modifiedFile.originalContent);
    const updatedContent = Buffer.from(modifiedFile.updatedContent);
    return !originalContent.equals(updatedContent);
  });

  if (productJson.checksums === undefined) {
    return {
      content: Buffer.isBuffer(productJsonContent)
        ? Buffer.from(productJsonContent)
        : Buffer.from(productJsonContent, 'utf8'),
      matchedChecksumKeys: [],
      untrackedFiles: changedFiles.map((file) => file.relativePath),
    };
  }
  if (
    !productJson.checksums ||
    typeof productJson.checksums !== 'object' ||
    Array.isArray(productJson.checksums)
  ) {
    throw new Error('product.json checksums 必须是对象');
  }

  const checksumEvidenceValues = Object.values(productJson.checksums);
  const matchedChecksumKeys = [];
  const untrackedFiles = [];
  for (const modifiedFile of changedFiles) {
    const originalContent = Buffer.from(modifiedFile.originalContent);
    const updatedContent = Buffer.from(modifiedFile.updatedContent);

    const matchingKeys = Object.keys(productJson.checksums).filter((checksumKey) =>
      checksumKeyMatchesRelativePath(checksumKey, modifiedFile.relativePath)
    );
    if (matchingKeys.length === 0) {
      untrackedFiles.push(modifiedFile.relativePath);
      continue;
    }
    if (matchingKeys.length > 1) {
      throw new Error(
        `${modifiedFile.relativePath} 匹配到多个 checksum 条目: ${matchingKeys.join(', ')}`
      );
    }

    const checksumKey = matchingKeys[0];
    const matchingFormats = inferChecksumFormat(
      originalContent,
      productJson.checksums[checksumKey]
    );
    productJson.checksums[checksumKey] = encodeUpdatedChecksum(
      updatedContent,
      matchingFormats,
      checksumEvidenceValues
    );
    matchedChecksumKeys.push(checksumKey);
  }

  return {
    content: Buffer.from(JSON.stringify(productJson, null, '\t'), 'utf8'),
    matchedChecksumKeys,
    untrackedFiles,
  };
}

module.exports = {
  CHECKSUM_ENCODINGS,
  SUPPORTED_HASH_ALGORITHMS,
  checksumKeyMatchesRelativePath,
  inferChecksumFormat,
  updateProductChecksums,
};
