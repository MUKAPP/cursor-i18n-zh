const fs = require('fs');
const os = require('os');
const path = require('path');

function createTemporaryDirectory(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function createCursorInstallation(rootDirectory, version = '3.11.13') {
  const appPath = path.join(rootDirectory, 'resources', 'app');
  const workbenchDirectory = path.join(appPath, 'out', 'vs', 'workbench');

  fs.mkdirSync(workbenchDirectory, { recursive: true });
  fs.writeFileSync(
    path.join(appPath, 'package.json'),
    `${JSON.stringify({ name: 'cursor', version }, null, 2)}\n`,
    'utf8'
  );
  fs.writeFileSync(
    path.join(appPath, 'product.json'),
    `${JSON.stringify({ nameShort: 'Cursor', checksums: {} }, null, 2)}\n`,
    'utf8'
  );
  fs.writeFileSync(
    path.join(workbenchDirectory, 'workbench.desktop.main.js'),
    'console.log("Cursor");\n',
    'utf8'
  );

  return appPath;
}

function removeTemporaryDirectory(directoryPath) {
  fs.rmSync(directoryPath, { recursive: true, force: true });
}

module.exports = {
  createTemporaryDirectory,
  createCursorInstallation,
  removeTemporaryDirectory,
};
