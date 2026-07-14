const os = require('os');
const path = require('path');

function resolveHomeDirectory(options = {}) {
  if (options.homeDirectory) return options.homeDirectory;
  return os.homedir();
}

function resolvePathImplementation(platform) {
  return platform === 'win32' ? path.win32 : path.posix;
}

function resolveCursorUserDirectory(options = {}) {
  const platform = options.platform || os.platform();
  const pathImplementation = resolvePathImplementation(platform);

  if (options.userDataDirectory) {
    return pathImplementation.join(
      pathImplementation.resolve(options.userDataDirectory),
      'User'
    );
  }

  const environment = options.environment || process.env;
  const homeDirectory = resolveHomeDirectory(options);

  if (platform === 'win32') {
    const applicationDataDirectory =
      environment.APPDATA ||
      pathImplementation.join(homeDirectory, 'AppData', 'Roaming');
    return pathImplementation.join(applicationDataDirectory, 'Cursor', 'User');
  }

  if (platform === 'darwin') {
    return pathImplementation.join(
      homeDirectory,
      'Library',
      'Application Support',
      'Cursor',
      'User'
    );
  }

  const configuredXdgDirectory = environment.XDG_CONFIG_HOME;
  const configDirectory =
    configuredXdgDirectory && pathImplementation.isAbsolute(configuredXdgDirectory)
      ? configuredXdgDirectory
      : pathImplementation.join(homeDirectory, '.config');
  return pathImplementation.join(configDirectory, 'Cursor', 'User');
}

function resolveCursorExtensionsDirectory(options = {}) {
  const platform = options.platform || os.platform();
  const pathImplementation = resolvePathImplementation(platform);
  return pathImplementation.join(resolveHomeDirectory(options), '.cursor', 'extensions');
}

function resolveToolDataDirectory(options = {}) {
  const platform = options.platform || os.platform();
  const pathImplementation = resolvePathImplementation(platform);
  return pathImplementation.join(resolveHomeDirectory(options), '.cursor-i18n-zh');
}

module.exports = {
  resolveHomeDirectory,
  resolveCursorUserDirectory,
  resolveCursorExtensionsDirectory,
  resolveToolDataDirectory,
};
