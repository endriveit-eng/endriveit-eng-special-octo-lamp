/**
 * Apps Script のソースを Node 上で読み込むための足場。
 * GAS 固有のグローバル（SpreadsheetApp など）は、テストに必要な分だけ差し替えます。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'src');

// 読み込む順番。config が先、main が最後。
const FILES = [
  'config.js',
  'utils.js',
  'flow.js',
  'sendManagement.js',
  'projectSheets.js',
  'alerts.js',
  'main.js',
];

function loadScripts() {
  const code = FILES
    .map((file) => fs.readFileSync(path.join(SRC, file), 'utf8'))
    .join('\n;\n');

  const sandbox = {
    console,
    // 日付の整形だけ使うので、最低限のふるまいを用意する
    Utilities: {
      formatDate(date, tz, format) {
        const pad = (n) => String(n).padStart(2, '0');
        return format
          .replace('yyyy', date.getFullYear())
          .replace('MM', pad(date.getMonth() + 1))
          .replace('dd', pad(date.getDate()));
      },
    },
    Session: {
      getScriptTimeZone: () => 'Asia/Tokyo',
      getEffectiveUser: () => ({ getEmail: () => '' }),
    },
    SpreadsheetApp: {},
    PropertiesService: {},
    MailApp: {},
    ScriptApp: {},
  };

  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'appsscript-bundle.js' });
  return sandbox;
}

module.exports = { loadScripts, FILES };
