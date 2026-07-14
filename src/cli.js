const SUPPORTED_COMMANDS = new Set([
  'help',
  'status',
  'locale',
  'localize',
  'restore',
]);

function parseCommandLine(argumentsList) {
  const parsedOptions = {
    command: null,
    appPath: null,
  };

  for (let argumentIndex = 0; argumentIndex < argumentsList.length; argumentIndex += 1) {
    const currentArgument = argumentsList[argumentIndex];

    if (currentArgument === '-h' || currentArgument === '--help') {
      if (parsedOptions.command && parsedOptions.command !== 'help') {
        throw new Error('帮助选项不能与其他命令同时使用。');
      }
      parsedOptions.command = 'help';
      continue;
    }

    if (currentArgument === '--app-path') {
      if (parsedOptions.appPath) {
        throw new Error('--app-path 只能指定一次。');
      }

      const appPath = argumentsList[argumentIndex + 1];
      if (!appPath || appPath.startsWith('-')) {
        throw new Error('--app-path 后必须提供 Cursor resources/app 目录。');
      }

      parsedOptions.appPath = appPath;
      argumentIndex += 1;
      continue;
    }

    if (currentArgument.startsWith('--app-path=')) {
      if (parsedOptions.appPath) {
        throw new Error('--app-path 只能指定一次。');
      }

      const appPath = currentArgument.slice('--app-path='.length);
      if (!appPath) {
        throw new Error('--app-path 后必须提供 Cursor resources/app 目录。');
      }

      parsedOptions.appPath = appPath;
      continue;
    }

    if (currentArgument.startsWith('-')) {
      throw new Error(`未知选项: ${currentArgument}`);
    }

    if (parsedOptions.command) {
      throw new Error(`多余的位置参数: ${currentArgument}`);
    }

    parsedOptions.command = currentArgument;
  }

  parsedOptions.command ||= 'help';
  if (!SUPPORTED_COMMANDS.has(parsedOptions.command)) {
    throw new Error(`未知命令: ${parsedOptions.command}`);
  }

  const commandsSupportingAppPath = new Set(['status', 'localize', 'restore']);
  if (parsedOptions.appPath && !commandsSupportingAppPath.has(parsedOptions.command)) {
    throw new Error(`${parsedOptions.command} 命令不支持 --app-path。`);
  }

  return parsedOptions;
}

module.exports = {
  SUPPORTED_COMMANDS,
  parseCommandLine,
};
