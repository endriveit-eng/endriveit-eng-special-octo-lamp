/**
 * 案件管理シート（健康経営 / AI導入補助金）の更新
 *
 * いちばん大事な点:
 *   行の位置ではなく「受注ID」で手入力欄を結び直します。
 *   そのため ecforce 側で受注が消えたり並びが変わったりしても、
 *   手入力した内容が別の案件にズレることがありません。
 *   （マニュアルの「やってはいけないこと」に書かれている事故の対策です）
 *
 * 列の扱い:
 *   A〜H列              … 抽出シートから毎回作り直す
 *   ★の付いた列・移行リンク … 受注IDをたよりに、そのまま引き継ぐ
 *   請求金額 / 書類そろい / 停滞日数 / アラート … 毎回計算し直す
 */

/** すべての案件管理シートを更新する（メニューから実行） */
function updateProjectSheets() {
  var ss = SpreadsheetApp.getActive();
  var results = updateProjectSheets_(ss, new Date());

  var parts = [];
  for (var i = 0; i < results.length; i++) {
    parts.push(results[i].label + ' ' + results[i].rows + '件');
  }
  SpreadsheetApp.getActive().toast(parts.join(' / ') || '対象シートがありません', '案件管理シート', 5);
  return results;
}

function updateProjectSheets_(ss, today) {
  var extract = loadExtract_(ss);
  var sheets = findProjectSheets_(ss);
  var results = [];

  for (var i = 0; i < sheets.length; i++) {
    results.push(updateOneProjectSheet_(sheets[i].sheet, sheets[i].type, extract, today));
  }
  return results;
}

/**
 * 案件管理シートを探す。
 * タブ名ではなく見出しで見分けるので、シート名を変えても動きます。
 */
function findProjectSheets_(ss) {
  var found = [];
  var sheets = ss.getSheets();

  for (var i = 0; i < sheets.length; i++) {
    var sheet = sheets[i];
    if (sheet.getLastRow() < 1 || sheet.getLastColumn() < 1) continue;

    var header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var index = buildHeaderIndex_(header);
    if (!findColumn_(index, [PROJECT_SHEET_SIGNATURE])) continue;

    for (var t = 0; t < PROJECT_SHEET_TYPES.length; t++) {
      if (findColumn_(index, [PROJECT_SHEET_TYPES[t].signatureHeader])) {
        found.push({ sheet: sheet, type: PROJECT_SHEET_TYPES[t] });
        break;
      }
    }
  }
  return found;
}

/** 案件管理シート1枚を更新する */
function updateOneProjectSheet_(sheet, type, extract, today) {
  var width = sheet.getLastColumn();
  var header = sheet.getRange(1, 1, 1, width).getValues()[0];
  var index = buildHeaderIndex_(header);
  var name = sheet.getName();

  var col = {
    orderId: requireColumn_(index, PROJECT_HEADERS.ORDER_ID, name),
    company: requireColumn_(index, PROJECT_HEADERS.COMPANY, name),
    personName: requireColumn_(index, PROJECT_HEADERS.NAME, name),
    email: requireColumn_(index, PROJECT_HEADERS.EMAIL, name),
    phone: requireColumn_(index, PROJECT_HEADERS.PHONE, name),
    source: requireColumn_(index, PROJECT_HEADERS.SOURCE, name),
    status: requireColumn_(index, PROJECT_HEADERS.STATUS, name),
    updated: requireColumn_(index, PROJECT_HEADERS.UPDATED, name),
    lineAdded: requireColumn_(index, PROJECT_HEADERS.LINE_ADDED, name),
    contractDate: requireColumn_(index, PROJECT_HEADERS.CONTRACT_DATE, name),
    total: requireColumn_(index, PROJECT_HEADERS.TOTAL, name),
    installments: requireColumn_(index, PROJECT_HEADERS.INSTALLMENTS, name),
    paidCount: requireColumn_(index, PROJECT_HEADERS.PAID_COUNT, name),
    handover: requireColumn_(index, PROJECT_HEADERS.HANDOVER, name),
    approval: requireColumn_(index, PROJECT_HEADERS.APPROVAL, name),
    perInstallment: requireColumn_(index, PROJECT_HEADERS.PER_INSTALLMENT, name),
    docsReady: requireColumn_(index, PROJECT_HEADERS.DOCS_READY, name),
    stallDays: requireColumn_(index, PROJECT_HEADERS.STALL_DAYS, name),
    alert: requireColumn_(index, PROJECT_HEADERS.ALERT, name),
  };

  // 書類の4列 = 入金済回数 と 事務局引渡日 のあいだにある ★ の列
  var docCols = [];
  for (var c = col.paidCount + 1; c < col.handover; c++) {
    if (String(header[c - 1] || '').indexOf('★') === 0) docCols.push(c);
  }

  // 毎回作り直す列。それ以外はすべて手入力として引き継ぐ
  var autoCols = {};
  [col.orderId, col.company, col.personName, col.email, col.phone, col.source,
   col.status, col.updated, col.perInstallment, col.docsReady, col.stallDays, col.alert]
    .forEach(function (c) { autoCols[c] = true; });

  var existing = readExistingRows_(sheet, width, col.orderId);
  var source = extract.byType[type.key] || [];

  var rows = [];
  var used = {};

  // 抽出にある案件を、受注ID順に並べ直す
  for (var i = 0; i < source.length; i++) {
    var rec = source[i];
    var kept = existing[rec.orderId] || null;
    used[rec.orderId] = true;
    rows.push(buildProjectRow_(width, col, docCols, autoCols, rec, kept, type, today, false));
  }

  // 抽出から消えた案件は、手入力を失わないように残してアラートで知らせる
  var orphanKeys = Object.keys(existing).filter(function (k) { return !used[k]; });
  orphanKeys.sort(compareOrderKeys_);
  for (var o = 0; o < orphanKeys.length; o++) {
    var old = existing[orphanKeys[o]];
    rows.push(buildProjectRow_(width, col, docCols, autoCols, null, old, type, today, true));
  }

  writeProjectRows_(sheet, rows, width, col);

  return {
    sheetName: name,
    label: type.label,
    rows: rows.length,
    orphans: orphanKeys.length,
    alerts: collectAlerts_(rows, col, type),
  };
}

/** いまシートに入っている行を { 受注ID: 行の配列 } にする */
function readExistingRows_(sheet, width, orderIdCol) {
  var map = {};
  // ARRAYFORMULA が下まで伸びていても、受注IDが入っている行までしか読まない
  var lastRow = findLastDataRow_(sheet, orderIdCol);
  if (lastRow < 2) return map;

  var values = sheet.getRange(2, 1, lastRow - 1, width).getValues();
  for (var r = 0; r < values.length; r++) {
    var id = orderKey_(values[r][orderIdCol - 1]);
    if (id) map[id] = values[r];
  }
  return map;
}

/** 1行分の値を組み立てる */
function buildProjectRow_(width, col, docCols, autoCols, rec, kept, type, today, isOrphan) {
  var row = [];
  var i;
  for (i = 0; i < width; i++) row.push('');

  // 手入力の列を引き継ぐ
  if (kept) {
    for (i = 1; i <= width; i++) {
      if (!autoCols[i]) row[i - 1] = kept[i - 1];
    }
  }

  if (rec) {
    row[col.orderId - 1] = rec.orderIdRaw;
    row[col.company - 1] = rec.company;
    row[col.personName - 1] = rec.name;
    row[col.email - 1] = rec.email;
    row[col.phone - 1] = rec.phone;
    row[col.source - 1] = deriveSource_(rec.purchaseUrl, rec.adGroup, type);
    row[col.status - 1] = rec.status;
    row[col.updated - 1] = rec.updated || '';
  } else if (kept) {
    // 抽出から消えた案件。前回の内容をそのまま残す
    row[col.orderId - 1] = kept[col.orderId - 1];
    row[col.company - 1] = kept[col.company - 1];
    row[col.personName - 1] = kept[col.personName - 1];
    row[col.email - 1] = kept[col.email - 1];
    row[col.phone - 1] = kept[col.phone - 1];
    row[col.source - 1] = kept[col.source - 1];
    row[col.status - 1] = kept[col.status - 1];
    row[col.updated - 1] = kept[col.updated - 1];
  }

  // 請求金額 = 契約総額 ÷ 支払回数 を四捨五入（端数は最終回で調整してください）
  var total = toNumber_(row[col.total - 1]);
  var times = toNumber_(row[col.installments - 1]);
  row[col.perInstallment - 1] = (total !== null && times) ? Math.round(total / times) : '';

  // 書類そろい
  row[col.docsReady - 1] = judgeDocsReady_(row, docCols);

  // 停滞日数
  var stall = daysSince_(row[col.updated - 1], today);
  row[col.stallDays - 1] = stall;

  // アラート
  row[col.alert - 1] = isOrphan
    ? '抽出に無し（ecforceで受注が削除された可能性）'
    : judgeAlert_(row, col, stall);

  return row;
}

/** 書類4つがすべて「受領」か「対象外」なら「完了」 */
function judgeDocsReady_(row, docCols) {
  if (!docCols.length) return '';
  for (var i = 0; i < docCols.length; i++) {
    var value = normalizeText_(row[docCols[i] - 1]);
    var done = false;
    for (var d = 0; d < DOC_DONE_VALUES.length; d++) {
      // 移行前は REGEXMATCH の部分一致だったので、含まれていれば完了とみなす
      if (value && value.indexOf(normalizeText_(DOC_DONE_VALUES[d])) >= 0) { done = true; break; }
    }
    if (!done) return '';
  }
  return '完了';
}

/**
 * アラートを決める（移行前の数式と同じ考え方）。
 *   認定日（交付決定日）が入っていれば、完了扱いで空欄
 *   LINE未追加 … 対応状況が LINE_REQUIRED_STATUSES のどれかなのに ★LINE追加 が「済」でない
 *   停滞 ○日   … ecforce の更新日から STALL_THRESHOLD_DAYS 日以上動いていない
 * LINE未追加 が出るときは、停滞は出しません（片方だけを表示します）。
 */
function judgeAlert_(row, col, stall) {
  if (String(row[col.approval - 1] || '').trim() !== '') return '';

  var lineAdded = normalizeText_(row[col.lineAdded - 1]) === normalizeText_('済');
  if (needsLineAdded_(row[col.status - 1]) && !lineAdded) return 'LINE未追加';

  if (typeof stall === 'number' && stall >= STALL_THRESHOLD_DAYS) {
    return '停滞 ' + stall + '日';
  }
  return '';
}

/** LINE追加が済んでいるべき対応状況かどうか */
function needsLineAdded_(status) {
  var key = normalizeText_(status);
  if (!key) return false;
  for (var i = 0; i < LINE_REQUIRED_STATUSES.length; i++) {
    if (key.indexOf(normalizeText_(LINE_REQUIRED_STATUSES[i])) >= 0) return true;
  }
  return false;
}

/** 書き込み。行が減ったぶんは消す */
function writeProjectRows_(sheet, rows, width, col) {
  var lastRow = sheet.getLastRow();

  if (rows.length) {
    sheet.getRange(2, 1, rows.length, width).setValues(rows);
    sheet.getRange(2, col.stallDays, rows.length, 1).setNumberFormat('0');
    sheet.getRange(2, col.perInstallment, rows.length, 1).setNumberFormat('#,##0');
    // 更新日がシリアル値のまま表示される問題への対策
    sheet.getRange(2, col.updated, rows.length, 1).setNumberFormat('yyyy/mm/dd hh:mm');
  }

  var firstEmptyRow = rows.length + 2;
  if (lastRow >= firstEmptyRow) {
    sheet.getRange(firstEmptyRow, 1, lastRow - firstEmptyRow + 1, width).clearContent();
  }
}

/** サマリ用に、アラートが立っている行だけ取り出す */
function collectAlerts_(rows, col, type) {
  var list = [];
  for (var i = 0; i < rows.length; i++) {
    var alert = String(rows[i][col.alert - 1] || '').trim();
    if (!alert) continue;
    list.push({
      label: type.label,
      orderId: rows[i][col.orderId - 1],
      company: rows[i][col.company - 1],
      name: rows[i][col.personName - 1],
      status: rows[i][col.status - 1],
      alert: alert,
    });
  }
  return list;
}

/**
 * 購入URL から流入元を求める。
 *   'partner' … 購入URLに代理店名が含まれていればその名前、無ければ「本体」
 *               （移行前の =IF(REGEXMATCH(購入URL,"takacreww"),"takacreww","本体") と同じ）
 *   'raw'     … 購入URLをそのまま使う
 * 代理店が増えたら config.js の partnerSlugs に足してください。
 */
function deriveSource_(purchaseUrl, adGroup, type) {
  var url = String(purchaseUrl || '').trim();
  if (!url) return String(adGroup || '').trim();
  if (type.sourceRule !== 'partner') return url;

  var slugs = type.partnerSlugs || [];
  var key = normalizeText_(url);
  for (var i = 0; i < slugs.length; i++) {
    if (key.indexOf(normalizeText_(slugs[i])) >= 0) return slugs[i];
  }
  return DIRECT_SOURCE_LABEL;
}

/** 受注IDの並べ替え用（数字は数字として比べる） */
function compareOrderKeys_(a, b) {
  var na = Number(a);
  var nb = Number(b);
  if (isFinite(na) && isFinite(nb)) return na - nb;
  return String(a) < String(b) ? -1 : (String(a) > String(b) ? 1 : 0);
}

/**
 * 抽出シートを読み、商材ごとに振り分ける。
 * 戻り値: { byType: { kenko: [...], ai: [...] } }
 */
function loadExtract_(ss) {
  var sheet = getSheet_(ss, SHEET_NAMES.EXTRACT);
  var lastRow = findLastDataRow_(sheet, 1);
  var byType = {};
  PROJECT_SHEET_TYPES.forEach(function (t) { byType[t.key] = []; });

  if (lastRow < 2) return { byType: byType };

  var width = sheet.getLastColumn();
  var values = sheet.getRange(1, 1, lastRow, width).getValues();
  var index = buildHeaderIndex_(values[0]);
  var name = sheet.getName();

  var col = {
    orderId: requireColumn_(index, EXTRACT_HEADERS.ORDER_ID, name),
    purchaseUrl: findColumn_(index, EXTRACT_HEADERS.PURCHASE_URL),
    status: requireColumn_(index, EXTRACT_HEADERS.STATUS, name),
    email: findColumn_(index, EXTRACT_HEADERS.EMAIL),
    name: findColumn_(index, EXTRACT_HEADERS.NAME),
    product: requireColumn_(index, EXTRACT_HEADERS.PRODUCT, name),
    adGroup: findColumn_(index, EXTRACT_HEADERS.AD_GROUP),
    phone: findColumn_(index, EXTRACT_HEADERS.PHONE),
    company: findColumn_(index, EXTRACT_HEADERS.COMPANY),
    updated: findColumn_(index, EXTRACT_HEADERS.UPDATED),
  };

  var seen = {};

  for (var r = 1; r < values.length; r++) {
    var raw = values[r][col.orderId - 1];
    var id = orderKey_(raw);
    if (!id || seen[id]) continue;   // 空行と重複を飛ばす
    seen[id] = true;

    var product = String(values[r][col.product - 1] || '');
    var purchaseUrl = col.purchaseUrl ? values[r][col.purchaseUrl - 1] : '';
    var type = matchProductType_(purchaseUrl, product);
    if (!type) continue;

    byType[type.key].push({
      orderId: id,
      orderIdRaw: raw,
      purchaseUrl: purchaseUrl,
      status: values[r][col.status - 1],
      email: col.email ? values[r][col.email - 1] : '',
      name: col.name ? values[r][col.name - 1] : '',
      product: product,
      adGroup: col.adGroup ? values[r][col.adGroup - 1] : '',
      phone: col.phone ? values[r][col.phone - 1] : '',
      company: col.company ? values[r][col.company - 1] : '',
      updated: col.updated ? toDate_(values[r][col.updated - 1]) : null,
    });
  }

  Object.keys(byType).forEach(function (key) {
    byType[key].sort(function (a, b) { return compareOrderKeys_(a.orderId, b.orderId); });
  });

  return { byType: byType };
}

/**
 * どの案件管理シートに入れるか決める。
 *
 * 移行前は購入URLだけで振り分けていました（05_健康経営 は "kenko-houjin"、
 * 05_AI導入補助金 は "surimun_invoice" を含むかどうか）。同じ挙動にしています。
 * ALSO_MATCH_BY_PRODUCT を true にすると、購入URLが当てはまらないときに
 * 購入商品名でも探します。
 */
function matchProductType_(purchaseUrl, product) {
  var url = normalizeText_(purchaseUrl);
  var i;

  for (i = 0; i < PROJECT_SHEET_TYPES.length; i++) {
    var pattern = normalizeText_(PROJECT_SHEET_TYPES[i].urlPattern);
    if (pattern && url && url.indexOf(pattern) >= 0) return PROJECT_SHEET_TYPES[i];
  }

  if (!ALSO_MATCH_BY_PRODUCT) return null;

  var name = normalizeText_(product);
  for (i = 0; i < PROJECT_SHEET_TYPES.length; i++) {
    var keyword = normalizeText_(PROJECT_SHEET_TYPES[i].productKeyword);
    if (keyword && name && name.indexOf(keyword) >= 0) return PROJECT_SHEET_TYPES[i];
  }
  return null;
}
