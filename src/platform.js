const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const { writeJsonAtomically } = require('./atomic-file');
const { resolveHomeDirectory, resolveToolDataDirectory } = require('./user-context');

const PLATFORM = os.platform();

const TARGET_FILES = [
  {
    rel: 'out/vs/workbench/workbench.desktop.main.js',
    label: 'Cursor Settings / Agent',
  },
  {
    rel: 'out/vs/workbench/workbench.glass.main.js',
    label: 'Glass 主页',
  },
  {
    rel: 'out/vs/workbench/workbench.anysphere-ui-automations.js',
    label: 'Automations 自动化页',
  },
];

const PRODUCT_REL = 'product.json';

function validateCursorInstallation(appPath, options = {}) {
  const fileSystem = options.fileSystem || fs;
  const requestedAppPath = path.resolve(appPath);

  try {
    if (!fileSystem.statSync(requestedAppPath).isDirectory()) {
      return { valid: false, reason: '指定路径不是目录' };
    }

    const normalizedAppPath = fileSystem.realpathSync(requestedAppPath);
    const packageJsonPath = path.join(normalizedAppPath, 'package.json');
    const productJsonPath = path.join(normalizedAppPath, PRODUCT_REL);
    const workbenchDirectory = path.join(normalizedAppPath, 'out', 'vs', 'workbench');
    const desktopWorkbenchPath = path.join(
      workbenchDirectory,
      'workbench.desktop.main.js'
    );

    if (!fileSystem.statSync(workbenchDirectory).isDirectory()) {
      return { valid: false, reason: '缺少 out/vs/workbench 目录' };
    }
    if (!fileSystem.statSync(desktopWorkbenchPath).isFile()) {
      return { valid: false, reason: '缺少 workbench.desktop.main.js' };
    }

    const packageJson = JSON.parse(fileSystem.readFileSync(packageJsonPath, 'utf8'));
    const productJson = JSON.parse(fileSystem.readFileSync(productJsonPath, 'utf8'));
    if (!packageJson || typeof packageJson !== 'object' || !packageJson.version) {
      return { valid: false, reason: 'package.json 缺少版本信息' };
    }
    if (!productJson || typeof productJson !== 'object') {
      return { valid: false, reason: 'product.json 内容无效' };
    }

    return { valid: true, appPath: normalizedAppPath };
  } catch (error) {
    return { valid: false, reason: `安装目录结构无效: ${error.message}` };
  }
}

function buildPlatformCandidates(options = {}) {
  const platform = options.platform || PLATFORM;
  const environment = options.environment || process.env;
  const homeDirectory = resolveHomeDirectory(options);

  if (platform === 'win32') {
    return [
      path.join(
        environment.LOCALAPPDATA || path.join(homeDirectory, 'AppData', 'Local'),
        'Programs',
        'cursor',
        'resources',
        'app'
      ),
      path.join(
        environment.ProgramFiles || 'C:\\Program Files',
        'cursor',
        'resources',
        'app'
      ),
    ];
  }

  if (platform === 'darwin') {
    return [
      '/Applications/Cursor.app/Contents/Resources/app',
      path.join(
        homeDirectory,
        'Applications',
        'Cursor.app',
        'Contents',
        'Resources',
        'app'
      ),
    ];
  }

  return [
    '/usr/share/cursor/resources/app',
    '/usr/lib/cursor/resources/app',
    '/opt/Cursor/resources/app',
    path.join(homeDirectory, '.local', 'share', 'cursor', 'resources', 'app'),
  ];
}

function inferCandidatesFromExecutable(options = {}) {
  const platform = options.platform || PLATFORM;
  const executeFileSync = options.executeFileSync || execFileSync;
  const fileSystem = options.fileSystem || fs;
  const executableName = platform === 'win32' ? 'cursor.cmd' : 'cursor';

  try {
    const locator = platform === 'win32' ? 'where' : 'which';
    const output = executeFileSync(locator, [executableName], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const executablePath = output.split(/\r?\n/).find(Boolean);
    if (!executablePath) return [];

    let resolvedExecutablePath = path.resolve(executablePath.trim());
    try {
      resolvedExecutablePath = fileSystem.realpathSync(resolvedExecutablePath);
    } catch {
      // 保留命令返回的路径，后续仍会严格验证候选安装目录。
    }

    const executableDirectory = path.dirname(resolvedExecutablePath);
    if (platform === 'darwin') {
      const appBundleMarker = `${path.sep}Cursor.app${path.sep}`;
      const markerIndex = resolvedExecutablePath.indexOf(appBundleMarker);
      if (markerIndex >= 0) {
        const appBundlePath = resolvedExecutablePath.slice(
          0,
          markerIndex + appBundleMarker.length - 1
        );
        return [path.join(appBundlePath, 'Contents', 'Resources', 'app')];
      }
    }

    return [
      path.join(executableDirectory, 'resources', 'app'),
      path.resolve(executableDirectory, '..', 'share', 'cursor', 'resources', 'app'),
    ];
  } catch {
    return [];
  }
}

function createCursorPaths(appPath, options = {}) {
  const platform = options.platform || PLATFORM;
  const source = options.source || 'auto';

  const appBundlePath =
    platform === 'darwin' && appPath.includes('/Contents/Resources/app')
      ? appPath.split('/Contents/Resources/app')[0]
      : null;

  return {
    appPath,
    source,
    appBundlePath,
    productJsonPath: path.join(appPath, PRODUCT_REL),
    targets: TARGET_FILES.map((t) => ({
      ...t,
      abs: path.join(appPath, t.rel),
    })),
  };
}

function detectCursorPath(options = {}) {
  const environment = options.environment || process.env;
  const explicitCandidates = [
    options.appPath
      ? { path: options.appPath, source: 'command-line' }
      : null,
    !options.appPath && environment.CURSOR_APP_PATH
      ? { path: environment.CURSOR_APP_PATH, source: 'environment' }
      : null,
  ].filter(Boolean);

  for (const candidate of explicitCandidates) {
    const validation = validateCursorInstallation(candidate.path, options);
    if (!validation.valid) {
      throw new Error(`Cursor 安装路径无效（${candidate.path}）：${validation.reason}`);
    }
    return createCursorPaths(validation.appPath, {
      ...options,
      source: candidate.source,
    });
  }

  const automaticCandidates = [
    ...inferCandidatesFromExecutable(options).map((candidatePath) => ({
      path: candidatePath,
      source: 'executable',
    })),
    ...buildPlatformCandidates(options).map((candidatePath) => ({
      path: candidatePath,
      source: 'known-location',
    })),
  ];
  const visitedPaths = new Set();

  for (const candidate of automaticCandidates) {
    const normalizedCandidate = path.resolve(candidate.path);
    if (visitedPaths.has(normalizedCandidate)) continue;
    visitedPaths.add(normalizedCandidate);

    const validation = validateCursorInstallation(normalizedCandidate, options);
    if (validation.valid) {
      return createCursorPaths(validation.appPath, {
        ...options,
        source: candidate.source,
      });
    }
  }

  return null;
}

function readCursorVersion(appPath) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(appPath, 'package.json'), 'utf8'));
    return pkg.version || 'unknown';
  } catch {
    return 'unknown';
  }
}

function detectLinuxCursorProcesses(paths, options = {}) {
  const fileSystem = options.fileSystem || fs;
  const procDirectory = options.procDirectory || '/proc';
  const requestedInstallationRoot = path.resolve(paths.appPath, '..', '..');
  let installationRoot = requestedInstallationRoot;
  try {
    installationRoot = fileSystem.realpathSync(requestedInstallationRoot);
  } catch {
    // detectCursorPath 已经规范化 appPath；测试文件系统也可能不实现该路径。
  }
  const currentProcessId = String(options.currentProcessId || process.pid);

  try {
    const processIds = fileSystem
      .readdirSync(procDirectory)
      .filter((directoryName) => /^\d+$/.test(directoryName));
    const matchedProcesses = [];
    const uncertainProcesses = [];

    for (const processId of processIds) {
      if (processId === currentProcessId) continue;

      let processName = '';
      try {
        processName = fileSystem
          .readFileSync(path.join(procDirectory, processId, 'comm'), 'utf8')
          .trim()
          .toLowerCase();
      } catch {
        // 仍可通过可执行文件路径判断，不在此处提前失败。
      }

      try {
        const executablePath = fileSystem
          .realpathSync(path.join(procDirectory, processId, 'exe'))
          .replace(/ \(deleted\)$/, '');
        const executableIsInsideInstallation =
          executablePath === installationRoot ||
          executablePath.startsWith(`${installationRoot}${path.sep}`);
        if (!executableIsInsideInstallation) continue;

        const executableName = path.basename(executablePath).toLowerCase();
        const looksLikeCursor =
          executableName.includes('cursor') || processName.includes('cursor');
        if (!looksLikeCursor) continue;

        matchedProcesses.push({
          pid: Number(processId),
          executablePath,
        });
      } catch (error) {
        if (error.code === 'ENOENT' || error.code === 'ESRCH') {
          continue;
        }

        const executableAccessDenied =
          error.code === 'EACCES' || error.code === 'EPERM';
        const processMightBeCursor =
          processName.includes('cursor') || (!processName && executableAccessDenied);
        if (processMightBeCursor) {
          uncertainProcesses.push({
            pid: Number(processId),
            reason: error.message,
          });
        }
      }
    }

    if (matchedProcesses.length > 0) {
      return { status: 'running', processes: matchedProcesses };
    }
    if (uncertainProcesses.length > 0) {
      return {
        status: 'unknown',
        processes: uncertainProcesses,
        reason: '存在无法确认可执行文件路径的进程',
      };
    }

    return {
      status: 'not-running',
      processes: [],
    };
  } catch (error) {
    return {
      status: 'unknown',
      processes: [],
      reason: `无法读取 ${procDirectory}: ${error.message}`,
    };
  }
}

function detectCursorProcesses(paths, options = {}) {
  const platform = options.platform || PLATFORM;
  const executeFileSync = options.executeFileSync || execFileSync;

  if (platform === 'linux') {
    return detectLinuxCursorProcesses(paths, options);
  }

  try {
    if (platform === 'darwin') {
      const output = executeFileSync('pgrep', ['-x', 'Cursor'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
      const processIds = output.split(/\s+/).filter(Boolean).map(Number);
      return {
        status: processIds.length > 0 ? 'running' : 'not-running',
        processes: processIds.map((processId) => ({ pid: processId })),
      };
    }

    if (platform === 'win32') {
      const output = executeFileSync(
        'tasklist',
        ['/FI', 'IMAGENAME eq Cursor.exe', '/FO', 'CSV', '/NH'],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
      );
      const running = /"Cursor\.exe"/i.test(output);
      return { status: running ? 'running' : 'not-running', processes: [] };
    }

    return { status: 'unknown', processes: [], reason: `不支持的平台: ${platform}` };
  } catch (error) {
    if (error.status === 1) {
      return { status: 'not-running', processes: [] };
    }
    return {
      status: 'unknown',
      processes: [],
      reason: `进程检测失败: ${error.message}`,
    };
  }
}

function isCursorRunning(paths, options = {}) {
  return detectCursorProcesses(paths, options).status === 'running';
}

function hasWritePermission(filePath, options = {}) {
  const fileSystem = options.fileSystem || fs;
  const accessMode = options.accessMode || fs.constants.W_OK;
  try {
    fileSystem.accessSync(filePath, accessMode);
    return true;
  } catch {
    return false;
  }
}

function needsElevation(paths, options = {}) {
  const fileSystem = options.fileSystem || fs;
  const files = [paths.productJsonPath, ...paths.targets.map((t) => t.abs)];
  const targetDirectories = new Set(
    files
      .filter((filePath) => fileSystem.existsSync(filePath))
      .map((filePath) => path.dirname(filePath))
  );

  return [...targetDirectories].some(
    (directoryPath) =>
      !hasWritePermission(directoryPath, {
        fileSystem,
        accessMode: fs.constants.W_OK | fs.constants.X_OK,
      })
  );
}

function isRoot() {
  return typeof process.getuid === 'function' && process.getuid() === 0;
}

function prepareAppForWrite(appBundlePath, filePaths, options = {}) {
  const platform = options.platform || PLATFORM;
  if (platform !== 'darwin') return;
  const executeFileSync = options.executeFileSync || execFileSync;

  if (appBundlePath && fs.existsSync(appBundlePath)) {
    try {
      executeFileSync('xattr', ['-cr', appBundlePath], { stdio: 'pipe' });
    } catch {
      /* ignore */
    }
  }

  for (const f of filePaths) {
    if (!fs.existsSync(f)) continue;
    try {
      fs.chmodSync(f, 0o644);
    } catch {
      /* ignore */
    }
  }
}

function getStatePath(options = {}) {
  return path.join(resolveToolDataDirectory(options), 'state.json');
}

function readState(options = {}) {
  try {
    return JSON.parse(fs.readFileSync(getStatePath(options), 'utf8'));
  } catch {
    return {};
  }
}

function writeState(state, options = {}) {
  const statePath = getStatePath(options);
  writeJsonAtomically(statePath, state, options);
}

function isStateForInstallation(state, appPath) {
  if (!state || !state.appPath) return false;

  try {
    return fs.realpathSync(state.appPath) === fs.realpathSync(appPath);
  } catch {
    return path.resolve(state.appPath) === path.resolve(appPath);
  }
}

module.exports = {
  PLATFORM,
  TARGET_FILES,
  buildPlatformCandidates,
  validateCursorInstallation,
  detectCursorPath,
  readCursorVersion,
  detectCursorProcesses,
  detectLinuxCursorProcesses,
  isCursorRunning,
  hasWritePermission,
  needsElevation,
  isRoot,
  prepareAppForWrite,
  readState,
  writeState,
  getStatePath,
  isStateForInstallation,
};
