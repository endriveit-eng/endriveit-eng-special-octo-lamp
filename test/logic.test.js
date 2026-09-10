/**
 * 判定ロジックのテスト。
 * シートに触らない純粋な関数だけを対象にしています。
 */
const test = require('node:test');
const assert = require('node:assert');
const { loadScripts } = require('./load.js');

const S = loadScripts();

/** 01_運用フロー を読んだ結果に相当するもの */
const FLOW = {
  stageByTemplate: { 'T-01': 3, 'T-02': 4, 'T-03': 5, 'T-04': 6, 'T-05': 7 },
  byStatus: {},
};
const STAGE = (order, status, mailName) => ({ order, status, mailName, templateId: '' });

test('normalizeText_ は表記ゆれを吸収する', () => {
  assert.strictEqual(S.normalizeText_('検討 中'), S.normalizeText_('検討中'));
  assert.strictEqual(S.normalizeText_('　商談済　'), S.normalizeText_('商談済'));
  assert.strictEqual(S.normalizeText_('t-01'), S.normalizeText_('T-01'));
  assert.strictEqual(S.normalizeText_(null), '');
});

test('orderKey_ は数値と文字列の受注IDを同じ扱いにする', () => {
  assert.strictEqual(S.orderKey_(1001), '1001');
  assert.strictEqual(S.orderKey_('1001'), '1001');
  assert.strictEqual(S.orderKey_(' 58 '), '58');
  assert.strictEqual(S.orderKey_(''), '');
  assert.strictEqual(S.orderKey_(null), '');
});

test('toNumber_ は桁区切りや円記号を外して読む', () => {
  assert.strictEqual(S.toNumber_('1,100,000'), 1100000);
  assert.strictEqual(S.toNumber_('¥770,000'), 770000);
  assert.strictEqual(S.toNumber_(90000), 90000);
  assert.strictEqual(S.toNumber_(''), null);
  assert.strictEqual(S.toNumber_('未定'), null);
});

test('toDate_ は文字列・シリアル値・Date のどれでも日付として読む', () => {
  assert.strictEqual(S.formatDate_(S.toDate_('2026/09/03 16:25')), '2026/09/03');
  assert.strictEqual(S.formatDate_(S.toDate_(new Date(2026, 8, 7))), '2026/09/07');
  // AI案件管理シートで更新日がシリアル値のまま入っていたケース
  assert.strictEqual(S.formatDate_(S.toDate_(46268.68403)), '2026/09/03');
  assert.strictEqual(S.toDate_(''), null);
});

test('daysSince_ は必ず数値を返す（日付表示にならない）', () => {
  const today = new Date(2026, 8, 10);
  assert.strictEqual(S.daysSince_(new Date(2026, 8, 1), today), 9);
  assert.strictEqual(S.daysSince_(new Date(2026, 8, 10), today), 0);
  assert.strictEqual(S.daysSince_('', today), '');
});

test('judgeTemplate_ は現在の段階のテンプレだけを ★次 にする', () => {
  const kentouchu = STAGE(4, '検討中', '検討中フォロー①');
  const judge = (tpl) => S.judgeTemplate_(tpl, kentouchu, false, FLOW, {}, '1001');

  assert.strictEqual(judge('T-01'), S.MARK.SENT_ASSUMED); // 前の段階
  assert.strictEqual(judge('T-02'), S.MARK.NEXT);         // いまの段階
  assert.strictEqual(judge('T-03'), S.MARK.NONE);         // 先の段階
  assert.strictEqual(judge('T-04'), S.MARK.NONE);
  assert.strictEqual(judge('T-05'), S.MARK.NONE);
});

test('judgeTemplate_ は 04_送信ログ の記録を推定より優先する', () => {
  const kentouchu = STAGE(4, '検討中', '検討中フォロー①');
  const log = { '1001|T-01': true, '1001|T-02': true };

  // 記録があるので「送信済」（推定ではない）
  assert.strictEqual(S.judgeTemplate_('T-01', kentouchu, false, FLOW, log, '1001'), S.MARK.SENT_LOGGED);
  // いまの段階でも、送った記録があれば ★次 にしない
  assert.strictEqual(S.judgeTemplate_('T-02', kentouchu, false, FLOW, log, '1001'), S.MARK.SENT_LOGGED);
  // 別の受注IDの記録は影響しない
  assert.strictEqual(S.judgeTemplate_('T-02', kentouchu, false, FLOW, log, '9999'), S.MARK.NEXT);
});

test('judgeTemplate_ は見送り案件をすべて「-」にする', () => {
  const miokuri = STAGE(8, '見送り', '（送信なし）');
  ['T-01', 'T-02', 'T-03', 'T-04', 'T-05'].forEach((tpl) => {
    assert.strictEqual(S.judgeTemplate_(tpl, miokuri, true, FLOW, {}, '1001'), S.MARK.NONE);
  });
});

test('judgeTemplate_ は成約の段階で T-05 を ★次 にする', () => {
  const seiyaku = STAGE(7, '成約', '締結御礼＋今後のご連絡');
  assert.strictEqual(S.judgeTemplate_('T-05', seiyaku, false, FLOW, {}, '1001'), S.MARK.NEXT);
  assert.strictEqual(S.judgeTemplate_('T-04', seiyaku, false, FLOW, {}, '1001'), S.MARK.SENT_ASSUMED);
});

test('judgeTemplate_ は対応状況がマスタに無ければ ? を出す', () => {
  assert.strictEqual(S.judgeTemplate_('T-01', null, false, FLOW, {}, '1001'), S.MARK.UNKNOWN);
});

test('isLostStatus_ は見送りだけを見分ける', () => {
  assert.strictEqual(S.isLostStatus_('見送り'), true);
  assert.strictEqual(S.isLostStatus_(' 見送り '), true);
  assert.strictEqual(S.isLostStatus_('検討中'), false);
});

test('readTemplateColumns_ は見出しからテンプレIDを取り出す', () => {
  const header = [
    '受注ID', '受注日', '名前', '会社名', '商材', '対応状況', '段階', '次に送るメール',
    'T-01 御礼', 'T-02 フォロー①', 'T-03 フォロー②', 'T-04 契約書', 'T-05 締結御礼', '経過日数',
  ];
  // vm 側で作られた配列なので、こちらの realm の配列に写してから比べる
  assert.deepStrictEqual(
    Array.from(S.readTemplateColumns_(header)),
    ['T-01', 'T-02', 'T-03', 'T-04', 'T-05']
  );
});

test('deriveSource_ は購入URLから流入元を求める', () => {
  const kenko = S.PROJECT_SHEET_TYPES.find((t) => t.key === 'kenko');
  const ai = S.PROJECT_SHEET_TYPES.find((t) => t.key === 'ai');

  assert.strictEqual(S.deriveSource_('kenko-houjin_takacreww_01', '', kenko), 'takacreww');
  assert.strictEqual(S.deriveSource_('kenko-houjin_01', '', kenko), '本体');
  assert.strictEqual(
    S.deriveSource_('2026ai_surimun_surimun_invoice', '', ai),
    '2026ai_surimun_surimun_invoice'
  );
  // 購入URLが空なら広告URLグループ名で代用する
  assert.strictEqual(S.deriveSource_('', '健康経営', kenko), '健康経営');
});

test('matchProductType_ は購入商品名から振り分け先を決める', () => {
  assert.strictEqual(S.matchProductType_('健康経営優良法人').key, 'kenko');
  assert.strictEqual(S.matchProductType_('AI導入補助金2026_invoice_AIすりむん').key, 'ai');
  assert.strictEqual(S.matchProductType_('関係のない商品'), null);
});

test('judgeDocsReady_ は4つ揃ったときだけ完了にする', () => {
  const docCols = [16, 17, 18, 19];
  const row = (a, b, c, d) => {
    const r = new Array(26).fill('');
    r[15] = a; r[16] = b; r[17] = c; r[18] = d;
    return r;
  };

  assert.strictEqual(S.judgeDocsReady_(row('受領', '受領', '受領', '受領'), docCols), '完了');
  assert.strictEqual(S.judgeDocsReady_(row('受領', '対象外', '受領', '対象外'), docCols), '完了');
  assert.strictEqual(S.judgeDocsReady_(row('受領', '依頼済', '受領', '受領'), docCols), '');
  assert.strictEqual(S.judgeDocsReady_(row('', '', '', ''), docCols), '');
});

// 案件管理シートの列位置（健康経営シートに合わせたもの）
const COL = {
  orderId: 1, company: 2, personName: 3, email: 4, phone: 5, source: 6,
  status: 7, updated: 8, lineAdded: 9, contractDate: 11, total: 12,
  installments: 13, paidCount: 15, handover: 20, approval: 22,
  perInstallment: 23, docsReady: 24, stallDays: 25, alert: 26,
};

function projectRow(overrides) {
  const r = new Array(27).fill('');
  Object.keys(overrides).forEach((key) => { r[COL[key] - 1] = overrides[key]; });
  return r;
}

test('judgeAlert_ は契約済みなのに LINE未追加の案件を拾う', () => {
  const row = projectRow({ contractDate: new Date(2026, 8, 1), lineAdded: '' });
  assert.strictEqual(S.judgeAlert_(row, COL, 3), 'LINE未追加');
});

test('judgeAlert_ は LINE追加済みならそのアラートを出さない', () => {
  const row = projectRow({ contractDate: new Date(2026, 8, 1), lineAdded: '済' });
  assert.strictEqual(S.judgeAlert_(row, COL, 3), '');
});

test('judgeAlert_ は7日以上動いていない案件を停滞にする', () => {
  const row = projectRow({});
  assert.strictEqual(S.judgeAlert_(row, COL, 7), '停滞 7日');
  assert.strictEqual(S.judgeAlert_(row, COL, 6), '');
});

test('judgeAlert_ は2つのアラートを並べて出す', () => {
  const row = projectRow({ contractDate: new Date(2026, 8, 1), lineAdded: '' });
  assert.strictEqual(S.judgeAlert_(row, COL, 10), 'LINE未追加 / 停滞 10日');
});

test('judgeAlert_ は認定日が入った案件を空欄にする', () => {
  const row = projectRow({
    contractDate: new Date(2026, 8, 1),
    lineAdded: '',
    approval: new Date(2026, 8, 9),
  });
  assert.strictEqual(S.judgeAlert_(row, COL, 30), '');
});

test('buildHeaderIndex_ と findColumn_ は見出し違いを吸収する', () => {
  const kenko = S.buildHeaderIndex_(['受注ID', '請求金額', '★認定日']);
  const ai = S.buildHeaderIndex_(['受注ID', '1回あたり金額', '★交付決定日']);

  assert.strictEqual(S.findColumn_(kenko, S.PROJECT_HEADERS.PER_INSTALLMENT), 2);
  assert.strictEqual(S.findColumn_(ai, S.PROJECT_HEADERS.PER_INSTALLMENT), 2);
  assert.strictEqual(S.findColumn_(kenko, S.PROJECT_HEADERS.APPROVAL), 3);
  assert.strictEqual(S.findColumn_(ai, S.PROJECT_HEADERS.APPROVAL), 3);
  assert.strictEqual(S.findColumn_(kenko, ['存在しない見出し']), 0);
});

test('compareOrderKeys_ は受注IDを数値順に並べる', () => {
  assert.deepStrictEqual(['100', '9', '58'].sort(S.compareOrderKeys_), ['9', '58', '100']);
});
