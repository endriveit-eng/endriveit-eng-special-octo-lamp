/**
 * 共通の小さな道具
 */

/**
 * シートを名前で取得する。
 * 完全一致 → 前方一致 → 部分一致 の順に探すので、
 * 「03_送信管理」で「03_送信管理260826」も見つかります。
 */
function getSheet_(ss, name) {
  var sheets = ss.getSheets();
  var i;
  for (i = 0; i < sheets.length; i++) {
    if (sheets[i].getName() === name) return sheets[i];
  }
  for (i = 0; i < sheets.length; i++) {
    if (sheets[i].getName().indexOf(name) === 0) return sheets[i];
  }
  for (i = 0; i < sheets.length; i++) {
    if (sheets[i].getName().indexOf(name) >= 0) return sheets[i];
  }
  throw new Error('シートが見つかりません: ' + name);
}

/**
 * 文字の表記ゆれをならす。
 * 全角スペース・半角スペース・改行を取り除き、英字は小文字にそろえます。
 * マニュアルにある「段階が『?』と表示される」の原因（表記ゆれ）対策です。
 */
function normalizeText_(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/[\s　]/g, '')
    .toLowerCase();
}

/** 見出し行から「見出し文字 → 列番号(1始まり)」の対応表を作る */
function buildHeaderIndex_(headerRow) {
  var index = {};
  for (var i = 0; i < headerRow.length; i++) {
    var key = normalizeText_(headerRow[i]);
    // 同じ見出しが複数あれば、左側を優先する
    if (key && !(key in index)) index[key] = i + 1;
  }
  return index;
}

/**
 * 候補の見出し名のどれかに一致する列番号を返す。見つからなければ 0。
 */
function findColumn_(headerIndex, candidates) {
  for (var i = 0; i < candidates.length; i++) {
    var key = normalizeText_(candidates[i]);
    if (key in headerIndex) return headerIndex[key];
  }
  return 0;
}

/**
 * 候補の見出し名のどれかに一致する列番号を返す。見つからなければ例外。
 */
function requireColumn_(headerIndex, candidates, sheetName) {
  var col = findColumn_(headerIndex, candidates);
  if (!col) {
    throw new Error(
      sheetName + ' に見出し「' + candidates.join('」「') + '」が見つかりません。' +
      '見出しを直すか、config.js の候補に追加してください。'
    );
  }
  return col;
}

/**
 * いろいろな形（Date / 文字列 / シリアル値）で入っている日付を Date にそろえる。
 * 値が無い・読めない場合は null。
 */
function toDate_(value) {
  if (value === null || value === undefined || value === '') return null;
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'number') {
    // スプレッドシートのシリアル値（1899-12-30 が 0）
    if (!isFinite(value) || value <= 0) return null;
    var ms = Math.round((value - 25569) * 86400000);
    var fromSerial = new Date(ms);
    return isNaN(fromSerial.getTime()) ? null : fromSerial;
  }
  var text = String(value).trim();
  if (!text) return null;
  var parsed = new Date(text.replace(/\//g, '-').replace(' ', 'T'));
  if (!isNaN(parsed.getTime())) return parsed;
  parsed = new Date(text);
  return isNaN(parsed.getTime()) ? null : parsed;
}

/** その日の 00:00 を返す（スクリプトのタイムゾーン基準） */
function startOfDay_(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * from から today までの日数。from が無ければ空文字。
 * 必ず数値を返すので、N列が日付表示になる問題は起きません。
 */
function daysSince_(from, today) {
  var d = toDate_(from);
  if (!d) return '';
  var diff = startOfDay_(today).getTime() - startOfDay_(d).getTime();
  return Math.floor(diff / 86400000);
}

/** 数値として読む。読めなければ null */
function toNumber_(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return isFinite(value) ? value : null;
  var text = String(value).replace(/[,\s　¥￥円]/g, '');
  if (!text) return null;
  var num = Number(text);
  return isFinite(num) ? num : null;
}

/** 受注IDを突き合わせ用の文字にそろえる（1001 と "1001" を同じ扱いにする） */
function orderKey_(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return String(value);
  var text = String(value).trim();
  if (!text) return '';
  var num = Number(text);
  return isFinite(num) && text !== '' ? String(num) : text;
}

/** 日付を yyyy/MM/dd の文字にする */
function formatDate_(date) {
  var d = toDate_(date);
  if (!d) return '';
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy/MM/dd');
}
