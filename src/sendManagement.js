/**
 * 03_送信管理 の再計算
 *
 * これまで数式でやっていた G〜O列 を GAS で書き込みます。
 * 数式が消えたり #ERROR! になったりしなくなり、経過日数が日付表示になる問題も起きません。
 *
 * 判定のきまり（01_運用フロー と 00_マニュアル に合わせています）:
 *   - いまの対応状況と同じ段階のテンプレ  → ★次（これを送る）
 *   - それより前の段階のテンプレ          → 送信済(推定)
 *   - それより後の段階のテンプレ          → -
 *   - 04_送信ログ に記録がある組み合わせ  → 送信済（推定ではなく事実）
 *   - 見送りの案件                        → すべて -
 */

/** 03_送信管理 を再計算する（メニューから実行） */
function updateSendManagement() {
  var ss = SpreadsheetApp.getActive();
  var result = updateSendManagement_(ss, new Date());
  SpreadsheetApp.getActive().toast(
    result.rows + '件を更新しました（★次: ' + result.nextCount + '件）',
    '03_送信管理',
    5
  );
  return result;
}

function updateSendManagement_(ss, today) {
  var flow = loadFlowMaster_(ss);
  var sentLog = loadSentLog_(ss);
  var sheet = getSheet_(ss, SHEET_NAMES.SEND_MGMT);

  // 受注ID列と主担当マスタ(S列)の、値が入っている最終行までしか読まない
  var lastRow = Math.max(
    findLastDataRow_(sheet, SEND_MGMT_COL.ORDER_ID),
    findLastDataRow_(sheet, SEND_MGMT_COL.OWNER_ID)
  );
  if (lastRow < 2) {
    clearBelow_(sheet, 2);
    return { rows: 0, nextCount: 0, next: [] };
  }

  var width = Math.max(sheet.getLastColumn(), SEND_MGMT_COL.OWNER_NAME);
  var values = sheet.getRange(1, 1, lastRow, width).getValues();

  var templateIds = readTemplateColumns_(values[0]);
  var owners = readOwnerMap_(values);

  var out = [];       // G〜O列 に書き込む値
  var next = [];      // ★次 が付いた案件（サマリ用）
  var rowCount = 0;

  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var orderId = orderKey_(row[SEND_MGMT_COL.ORDER_ID - 1]);

    if (!orderId) {
      // 受注IDが無い行は、前回の計算結果が残らないように空にする
      out.push(blankRow_(SEND_MGMT_COL.OWNER - SEND_MGMT_COL.STAGE + 1));
      continue;
    }
    rowCount++;

    var status = row[SEND_MGMT_COL.STATUS - 1];
    var stageRow = lookupStage_(flow, status);
    var isLost = isLostStatus_(status);

    var stageCell = stageRow ? stageRow.order : MARK.UNKNOWN;
    var nextMail = stageRow
      ? stageRow.mailName
      : '対応状況「' + String(status || '') + '」が' + SHEET_NAMES.FLOW + 'にありません';

    var marks = [];
    for (var t = 0; t < templateIds.length; t++) {
      var mark = judgeTemplate_(
        templateIds[t], stageRow, isLost, flow, sentLog, orderId
      );
      marks.push(mark);
      if (mark === MARK.NEXT) {
        next.push({
          orderId: orderId,
          company: row[SEND_MGMT_COL.COMPANY - 1],
          name: row[SEND_MGMT_COL.NAME - 1],
          status: status,
          templateId: templateIds[t],
          mailName: stageRow ? stageRow.mailName : '',
        });
      }
    }

    var days = daysSince_(row[SEND_MGMT_COL.ORDER_DATE - 1], today);
    var owner = owners[orderId] || '未設定';

    out.push([stageCell, nextMail].concat(marks, [days, owner]));
  }

  // G列〜O列 をまとめて書き込む
  var startCol = SEND_MGMT_COL.STAGE;
  var numCols = SEND_MGMT_COL.OWNER - SEND_MGMT_COL.STAGE + 1;
  sheet.getRange(2, startCol, out.length, numCols).setValues(out);

  // 経過日数は必ず数値で表示する（日付表示になる問題の対策）
  sheet.getRange(2, SEND_MGMT_COL.DAYS, out.length, 1).setNumberFormat('0');

  // 移行前の数式が下まで伸びている分を消す
  clearBelow_(sheet, out.length + 2);

  return { rows: rowCount, nextCount: next.length, next: next };
}

/** 見出し行の I〜M列 から テンプレID（T-01 など）を読み取る */
function readTemplateColumns_(headerRow) {
  var ids = [];
  for (var c = SEND_MGMT_COL.TPL_FIRST; c <= SEND_MGMT_COL.TPL_LAST; c++) {
    var text = String(headerRow[c - 1] || '');
    var matched = text.match(/T-\d+/i);
    ids.push(matched ? matched[0].toUpperCase() : '');
  }
  return ids;
}

/** S列・T列の主担当マスタを { 受注ID: 担当者名 } にする */
function readOwnerMap_(values) {
  var map = {};
  for (var r = 1; r < values.length; r++) {
    var id = orderKey_(values[r][SEND_MGMT_COL.OWNER_ID - 1]);
    var name = String(values[r][SEND_MGMT_COL.OWNER_NAME - 1] || '').trim();
    if (id && name) map[id] = name;
  }
  return map;
}

/** テンプレ1つ分の表示を決める */
function judgeTemplate_(templateId, stageRow, isLost, flow, sentLog, orderId) {
  if (!templateId) return MARK.NONE;

  // 実際に送ったという記録が最優先
  if (sentLog[orderId + '|' + templateId]) return MARK.SENT_LOGGED;

  if (!stageRow) return MARK.UNKNOWN;
  if (isLost) return MARK.NONE;

  var templateStage = flow.stageByTemplate[templateId];
  if (templateStage === undefined) return MARK.NONE;

  // TEMPLATE_STAGE_OFFSET が 0 なら 01_運用フロー のとおり、
  // -1 なら移行前のスプレッドシートと同じ（1段階早い）判定になる
  var targetStage = templateStage + TEMPLATE_STAGE_OFFSET;

  if (targetStage < stageRow.order) return MARK.SENT_ASSUMED;
  if (targetStage === stageRow.order) return MARK.NEXT;
  return MARK.NONE;
}

/** G〜O列 の、指定行から下に残っている内容を消す */
function clearBelow_(sheet, firstRow) {
  var lastRow = sheet.getLastRow();
  if (lastRow < firstRow) return;
  var numCols = SEND_MGMT_COL.OWNER - SEND_MGMT_COL.STAGE + 1;
  sheet.getRange(firstRow, SEND_MGMT_COL.STAGE, lastRow - firstRow + 1, numCols).clearContent();
}

/** 見送り扱いの対応状況かどうか */
function isLostStatus_(status) {
  var key = normalizeText_(status);
  for (var i = 0; i < LOST_STATUSES.length; i++) {
    if (normalizeText_(LOST_STATUSES[i]) === key) return true;
  }
  return false;
}

/**
 * 04_送信ログ を読んで「この受注IDにこのテンプレを送った」の一覧を作る。
 * 戻り値は { '1001|T-01': true, ... }
 */
function loadSentLog_(ss) {
  var sheet = getSheet_(ss, SHEET_NAMES.SEND_LOG);
  var lastRow = sheet.getLastRow();
  var sent = {};
  if (lastRow < 2) return sent;

  var values = sheet.getRange(2, 1, lastRow - 1, SEND_LOG_COL.MEMO).getValues();
  for (var r = 0; r < values.length; r++) {
    var id = orderKey_(values[r][SEND_LOG_COL.ORDER_ID - 1]);
    var tpl = String(values[r][SEND_LOG_COL.TEMPLATE_ID - 1] || '').trim().toUpperCase();
    if (id && /^T-\d+$/.test(tpl)) sent[id + '|' + tpl] = true;
  }
  return sent;
}

/** 空セルが n 個並んだ配列 */
function blankRow_(n) {
  var row = [];
  for (var i = 0; i < n; i++) row.push('');
  return row;
}
