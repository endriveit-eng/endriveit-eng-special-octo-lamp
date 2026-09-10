/**
 * 01_運用フロー（マスタ）の読み込み
 *
 * 対応状況と段階・送るメール・テンプレIDの対応は、すべてこのシートが正です。
 * ecforce 側でステージを増減したら 01_運用フロー を直せば、他は自動で追従します。
 */

/**
 * 01_運用フロー を読んでマスタを組み立てる。
 *
 * 戻り値:
 *   {
 *     rows:        [{order, status, mailName, templateId}, ...],
 *     byStatus:    { 正規化した対応状況: 行 },
 *     stageByTemplate: { 'T-01': 3, ... },
 *     maxOrder:    8
 *   }
 */
function loadFlowMaster_(ss) {
  var sheet = getSheet_(ss, SHEET_NAMES.FLOW);
  var values = sheet.getDataRange().getValues();

  var rows = [];
  var byStatus = {};
  var stageByTemplate = {};
  var maxOrder = 0;

  // 1行目は見出し。2行目以降を、順が数字の間だけ読む（下の注意書きで止まる）
  for (var r = 1; r < values.length; r++) {
    var order = toNumber_(values[r][FLOW_COL.ORDER - 1]);
    var status = String(values[r][FLOW_COL.STATUS - 1] || '').trim();
    if (order === null || !status) continue;

    var templateId = String(values[r][FLOW_COL.TEMPLATE_ID - 1] || '').trim();
    // 「-」や空欄は「送るテンプレ無し」の意味
    if (templateId === '-' || templateId === '－') templateId = '';

    var row = {
      order: order,
      status: status,
      mailName: String(values[r][FLOW_COL.MAIL_NAME - 1] || '').trim(),
      templateId: templateId,
    };

    rows.push(row);
    byStatus[normalizeText_(status)] = row;
    if (templateId) stageByTemplate[templateId] = order;
    if (order > maxOrder) maxOrder = order;
  }

  if (!rows.length) {
    throw new Error(SHEET_NAMES.FLOW + ' からマスタを読めませんでした。見出しと「順」列を確認してください。');
  }

  return {
    rows: rows,
    byStatus: byStatus,
    stageByTemplate: stageByTemplate,
    maxOrder: maxOrder,
  };
}

/**
 * 対応状況からマスタの行を引く。表記ゆれは normalizeText_ で吸収する。
 * 見つからなければ null（呼び出し側で「?」を出す）。
 */
function lookupStage_(flow, status) {
  var key = normalizeText_(status);
  if (!key) return null;
  return flow.byStatus[key] || null;
}
