const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const { applyInstallationReplacements } = require('../src/installation-writer');
const {
  commitTransaction,
  createInstallationTransaction,
  inspectTransaction,
  loadPendingTransactions,
  recoverTransaction,
  updateTransactionPhase,
  validateJournal,
} = require('../src/transaction');
const {
  createCursorInstallation,
  createTemporaryDirectory,
  removeTemporaryDirectory,
} = require('./helpers');

const DESKTOP_RELATIVE_PATH =
  'out/vs/workbench/workbench.desktop.main.js';

function createTransactionFixture(testPrefix) {
  const rootDirectory = createTemporaryDirectory(testPrefix);
  const appPath = createCursorInstallation(path.join(rootDirectory, 'installation'));
  const homeDirectory = path.join(rootDirectory, 'home');
  const desktopPath = path.join(appPath, DESKTOP_RELATIVE_PATH);
  const productPath = path.join(appPath, 'product.json');
  const desktopBefore = fs.readFileSync(desktopPath);
  const desktopAfter = Buffer.from('console.log("已汉化");\n', 'utf8');
  const productBefore = fs.readFileSync(productPath);
  const productAfter = Buffer.from(
    `${JSON.stringify({ nameShort: 'Cursor', checksums: {}, localized: true }, null, 2)}\n`,
    'utf8'
  );
  const finalState = {
    appPath,
    localizedVersion: '3.11.13',
  };

  const transaction = createInstallationTransaction(
    {
      operation: 'localize',
      appPath,
      cursorVersion: '3.11.13',
      files: [
        {
          relativePath: DESKTOP_RELATIVE_PATH,
          contentType: 'javascript',
          beforeContent: desktopBefore,
          afterContent: desktopAfter,
        },
        {
          relativePath: 'product.json',
          contentType: 'json',
          beforeContent: productBefore,
          afterContent: productAfter,
        },
      ],
      finalState,
    },
    { homeDirectory }
  );

  return {
    appPath,
    desktopAfter,
    desktopBefore,
    desktopPath,
    finalState,
    homeDirectory,
    productAfter,
    productBefore,
    productPath,
    rootDirectory,
    transaction,
  };
}

function applyFixtureReplacements(appPath, replacements) {
  return applyInstallationReplacements(appPath, replacements, {
    needsElevation: false,
  });
}

test('事务提交成功后写入状态并清理 journal', () => {
  const fixture = createTransactionFixture('cursor-i18n-transaction-commit-');
  const writtenStates = [];

  try {
    commitTransaction(fixture.transaction, {
      homeDirectory: fixture.homeDirectory,
      applyReplacements: (replacements) =>
        applyFixtureReplacements(fixture.appPath, replacements),
      writeFinalState(state) {
        writtenStates.push(state);
      },
    });

    assert.deepEqual(fs.readFileSync(fixture.desktopPath), fixture.desktopAfter);
    assert.deepEqual(fs.readFileSync(fixture.productPath), fixture.productAfter);
    assert.deepEqual(writtenStates, [fixture.finalState]);
    assert.equal(fs.existsSync(fixture.transaction.directoryPath), false);
  } finally {
    removeTemporaryDirectory(fixture.rootDirectory);
  }
});

test('安装已提交但状态写入失败时保留可恢复 journal', () => {
  const fixture = createTransactionFixture('cursor-i18n-transaction-state-');

  try {
    assert.throws(
      () =>
        commitTransaction(fixture.transaction, {
          homeDirectory: fixture.homeDirectory,
          applyReplacements: (replacements) =>
            applyFixtureReplacements(fixture.appPath, replacements),
          writeFinalState() {
            throw new Error('模拟状态写入失败');
          },
        }),
      /状态写入失败/
    );
    assert.equal(fixture.transaction.journal.phase, 'committed');
    assert.equal(fs.existsSync(fixture.transaction.directoryPath), true);

    const pendingTransactions = loadPendingTransactions({
      homeDirectory: fixture.homeDirectory,
    });
    const writtenStates = [];
    const result = recoverTransaction(pendingTransactions[0], {
      homeDirectory: fixture.homeDirectory,
      applyReplacements: (replacements) =>
        applyFixtureReplacements(fixture.appPath, replacements),
      writeFinalState(state) {
        writtenStates.push(state);
      },
    });

    assert.deepEqual(result, { action: 'completed' });
    assert.deepEqual(writtenStates, [fixture.finalState]);
  } finally {
    removeTemporaryDirectory(fixture.rootDirectory);
  }
});

test('混合安装状态自动回滚到事务前内容', () => {
  const fixture = createTransactionFixture('cursor-i18n-transaction-mixed-');

  try {
    updateTransactionPhase(fixture.transaction, 'committing', {
      homeDirectory: fixture.homeDirectory,
    });
    fs.writeFileSync(fixture.desktopPath, fixture.desktopAfter);
    assert.equal(inspectTransaction(fixture.transaction).status, 'mixed');

    const result = recoverTransaction(fixture.transaction, {
      homeDirectory: fixture.homeDirectory,
      applyReplacements: (replacements) =>
        applyFixtureReplacements(fixture.appPath, replacements),
      writeFinalState() {
        throw new Error('混合状态回滚不应写成功状态');
      },
    });

    assert.deepEqual(result, { action: 'rolled-back' });
    assert.deepEqual(fs.readFileSync(fixture.desktopPath), fixture.desktopBefore);
    assert.deepEqual(fs.readFileSync(fixture.productPath), fixture.productBefore);
  } finally {
    removeTemporaryDirectory(fixture.rootDirectory);
  }
});

test('事务遇到外部冲突或损坏暂存时拒绝恢复', () => {
  const fixture = createTransactionFixture('cursor-i18n-transaction-conflict-');

  try {
    fs.writeFileSync(fixture.desktopPath, 'console.log("外部修改");\n', 'utf8');
    assert.equal(inspectTransaction(fixture.transaction).status, 'conflict');
    assert.throws(
      () =>
        recoverTransaction(fixture.transaction, {
          homeDirectory: fixture.homeDirectory,
          applyReplacements: (replacements) =>
            applyFixtureReplacements(fixture.appPath, replacements),
          writeFinalState() {},
        }),
      /外部修改或缺失/
    );

    const stagedAfterPath = path.join(
      fixture.transaction.directoryPath,
      fixture.transaction.journal.files[0].after.path
    );
    fs.writeFileSync(stagedAfterPath, 'corrupted', 'utf8');
    assert.throws(
      () => loadPendingTransactions({ homeDirectory: fixture.homeDirectory }),
      /大小不匹配|摘要不匹配/
    );
  } finally {
    removeTemporaryDirectory(fixture.rootDirectory);
  }
});

test('事务 journal 拒绝未知目标、越界暂存路径和错误状态归属', () => {
  const fixture = createTransactionFixture('cursor-i18n-transaction-journal-');

  try {
    const unknownTargetJournal = structuredClone(fixture.transaction.journal);
    unknownTargetJournal.files[0].relativePath = '../../etc/passwd';
    assert.throws(() => validateJournal(unknownTargetJournal), /不允许的目标/);

    const escapedStagedPathJournal = structuredClone(fixture.transaction.journal);
    escapedStagedPathJournal.files[0].before.path = '../outside.js';
    assert.throws(() => validateJournal(escapedStagedPathJournal), /路径无效/);

    const wrongStateJournal = structuredClone(fixture.transaction.journal);
    wrongStateJournal.finalState.appPath = '/another/cursor/resources/app';
    assert.throws(() => validateJournal(wrongStateJournal), /最终状态与安装路径不一致/);
  } finally {
    removeTemporaryDirectory(fixture.rootDirectory);
  }
});

test('事务阶段只能向前转换且必须符合安装文件状态', () => {
  const fixture = createTransactionFixture('cursor-i18n-transaction-phase-');

  try {
    assert.throws(
      () =>
        updateTransactionPhase(fixture.transaction, 'committed', {
          homeDirectory: fixture.homeDirectory,
        }),
      /不能从 prepared 转换为 committed/
    );

    fs.writeFileSync(fixture.desktopPath, fixture.desktopAfter);
    fs.writeFileSync(fixture.productPath, fixture.productAfter);
    assert.throws(
      () =>
        recoverTransaction(fixture.transaction, {
          homeDirectory: fixture.homeDirectory,
          applyReplacements: (replacements) =>
            applyFixtureReplacements(fixture.appPath, replacements),
          writeFinalState() {},
        }),
      /阶段 prepared 与文件状态 after 不一致/
    );
  } finally {
    removeTemporaryDirectory(fixture.rootDirectory);
  }
});

test('事务拒绝暂存文件符号链接并允许全量无操作', () => {
  const fixture = createTransactionFixture('cursor-i18n-transaction-link-');

  try {
    const stagedAfterPath = path.join(
      fixture.transaction.directoryPath,
      fixture.transaction.journal.files[0].after.path
    );
    const externalContentPath = path.join(fixture.rootDirectory, 'external.js');
    fs.writeFileSync(externalContentPath, fixture.desktopAfter);
    fs.unlinkSync(stagedAfterPath);
    fs.symlinkSync(externalContentPath, stagedAfterPath);
    assert.throws(
      () => loadPendingTransactions({ homeDirectory: fixture.homeDirectory }),
      /暂存目标不是普通文件/
    );

    const noOperationHome = path.join(fixture.rootDirectory, 'noop-home');
    const noOperation = createInstallationTransaction(
      {
        operation: 'restore',
        appPath: fixture.appPath,
        cursorVersion: '3.11.13',
        files: [
          {
            relativePath: DESKTOP_RELATIVE_PATH,
            contentType: 'javascript',
            beforeContent: fixture.desktopBefore,
            afterContent: fixture.desktopBefore,
          },
        ],
        finalState: { appPath: fixture.appPath, localizedVersion: null },
      },
      { homeDirectory: noOperationHome }
    );
    assert.equal(noOperation, null);
  } finally {
    removeTemporaryDirectory(fixture.rootDirectory);
  }
});
