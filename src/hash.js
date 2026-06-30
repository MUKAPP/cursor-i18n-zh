const fs = require('fs');
const crypto = require('crypto');

function detectHashAlgo(hash) {
  const len = hash.length;
  if (len <= 24) return 'md5';
  if (len <= 44) return 'sha256';
  if (len <= 88) return 'sha512';
  return 'sha256';
}

function fixProductHashes(productJsonPath, updatedFiles) {
  if (!fs.existsSync(productJsonPath)) return [];

  const productJson = JSON.parse(fs.readFileSync(productJsonPath, 'utf8'));
  const fixed = [];

  if (!productJson.checksums) return fixed;

  for (const { hashKey, abs } of updatedFiles) {
    if (!hashKey || !fs.existsSync(abs)) continue;

    const content = fs.readFileSync(abs);
    for (const key of Object.keys(productJson.checksums)) {
      if (key.endsWith(hashKey)) {
        const oldHash = productJson.checksums[key];
        const algo = detectHashAlgo(oldHash);
        const newHash = crypto.createHash(algo).update(content).digest('base64').replace(/=+$/, '');
        productJson.checksums[key] = newHash;
        fixed.push(hashKey);
        break;
      }
    }
  }

  if (fixed.length > 0) {
    fs.writeFileSync(productJsonPath, JSON.stringify(productJson, null, '\t'), 'utf8');
  }

  return fixed;
}

module.exports = { fixProductHashes };
