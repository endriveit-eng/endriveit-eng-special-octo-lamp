/**
 * 全体設定
 *
 * シート名・見出し名・しきい値はすべてこのファイルにまとめています。
 * 運用を変えるときは、まずここを見てください。他のファイルはここの定義を参照しています。
 */

/**
 * シート名。
 * 完全一致で見つからなければ前方一致・部分一致でも探すので、
 * 「00_マニュアル260826」のように日付が付いていても動きます。
 */
var SHEET_NAMES = {
  EXTRACT: '抽出',
  FLOW: '01_運用フロー',
  SEND_MGMT: '03_送信管理',
  SEND_LOG: '04_送信ログ',
};

/** ecforce の更新日から何日動いていなければ「停滞」とみなすか */
var STALL_THRESHOLD_DAYS = 7;

/** 03_送信管理 の列番号（A=1） */
var SEND_MGMT_COL = {
  ORDER_ID: 1,     // A 受注ID
  ORDER_DATE: 2,   // B 受注日
  NAME: 3,         // C 名前
  COMPANY: 4,      // D 会社名
  PRODUCT: 5,      // E 商材
  STATUS: 6,       // F 対応状況
  STAGE: 7,        // G 段階（自動）
  NEXT_MAIL: 8,    // H 次に送るメール（自動）
  TPL_FIRST: 9,    // I〜M テンプレ別の状態（自動）
  TPL_LAST: 13,
  DAYS: 14,        // N 経過日数（自動）
  OWNER: 15,       // O 担当者（自動・S/T列から引く）
  OWNER_ID: 19,    // S 受注ID（主担当マスタ・手入力）
  OWNER_NAME: 20,  // T 担当者名（主担当マスタ・手入力）
};

/** 04_送信ログ の列番号（A=1） */
var SEND_LOG_COL = {
  SENT_DATE: 1,    // A 送信日
  ORDER_ID: 2,     // B 受注ID
  COMPANY: 3,      // C 会社名
  TEMPLATE_ID: 4,  // D テンプレID
  OWNER: 5,        // E 担当者
  MEMO: 6,         // F メモ
};

/** 01_運用フロー の列番号（A=1） */
var FLOW_COL = {
  ORDER: 1,        // A 順
  STATUS: 2,       // B 対応状況
  ECFORCE_ID: 3,   // C ecforce ID
  MAIL_NAME: 4,    // D 送るメール
  TEMPLATE_ID: 5,  // E テンプレID
};

/**
 * テンプレを「★次」にする段階のずらし幅。
 *
 *   0  … 01_運用フロー のとおり。商談済(3) で T-01 が ★次 になる。
 *         マニュアルの「3 商談済 … ここで T-01 を送ります」と一致します。
 *  -1  … 移行前のスプレッドシートと同じ挙動。MTG予約済(2) で T-01 が ★次 になる。
 *
 * 移行前の数式は -1 相当でしたが、MTGを実施する前に「MTG御礼」を送る指示に
 * なってしまうため、0（マニュアルどおり）を初期値にしています。
 */
var TEMPLATE_STAGE_OFFSET = 0;

/**
 * 抽出シートの列は見出しの文字で探します。
 * ecforce の出力見出しが変わったら、ここに新しい表記を足してください。
 */
var EXTRACT_HEADERS = {
  ORDER_ID: ['受注ID'],
  PURCHASE_URL: ['購入URL'],
  STATUS: ['対応状況'],
  EMAIL: ['メールアドレス'],
  ORDER_DATE: ['受注日'],
  NAME: ['請求先（名前フル）', '請求先(名前フル)'],
  PRODUCT: ['購入商品（商品名）', '購入商品(商品名)'],
  AD_GROUP: ['広告URLグループ名'],
  PHONE: ['請求先（電話番号フル・ハイフンあり）', '請求先(電話番号フル・ハイフンあり)'],
  COMPANY: ['会社名'],
  UPDATED: ['更新日'],
};

/**
 * 案件管理シートの列も見出しの文字で探します。
 * 健康経営とAI導入補助金で見出しが違う列があるため、候補を複数持たせています。
 */
var PROJECT_HEADERS = {
  ORDER_ID: ['受注ID'],
  COMPANY: ['会社名'],
  NAME: ['氏名'],
  EMAIL: ['メールアドレス'],
  PHONE: ['電話'],
  SOURCE: ['流入元'],
  STATUS: ['対応状況'],
  UPDATED: ['更新日'],
  LINE_ADDED: ['★LINE追加'],
  CONTRACT_DATE: ['★契約締結日'],
  TOTAL: ['★契約総額'],
  INSTALLMENTS: ['★支払回数'],
  PAID_COUNT: ['★入金済回数'],
  HANDOVER: ['★事務局引渡日'],
  APPROVAL: ['★認定日', '★交付決定日'],
  PER_INSTALLMENT: ['請求金額', '1回あたり金額'],
  DOCS_READY: ['書類そろい'],
  STALL_DAYS: ['停滞日数'],
  ALERT: ['アラート'],
};

/** 案件管理シートだと判定するための見出し（この列があれば案件管理シート） */
var PROJECT_SHEET_SIGNATURE = '★契約締結日';

/**
 * 書類欄で「そろった」とみなす値（部分一致）。
 * 移行前は 05_健康経営 だけ「受領」しか認めておらず、
 * 「対象外」を選んでも完了になりませんでした。
 * マニュアルの記載と 05_AI導入補助金 に合わせて、両方を認めます。
 */
var DOC_DONE_VALUES = ['受領', '対象外'];

/**
 * 「LINE未追加」のアラートを出す対応状況。
 * この状態なのに ★LINE追加 が「済」でなければアラートを出します。
 * 移行前の数式と同じ内容です（01_運用フロー の8段階には無い状態も含みます）。
 */
var LINE_REQUIRED_STATUSES = ['成約', '請求書送付済', '入金確認済', '書類回収中'];

/**
 * 案件管理シートの種類。
 * シート名ではなく「そのシートにしかない見出し」で見分けるので、
 * タブ名（05_健康経営 など）を変えても動きます。
 */
var PROJECT_SHEET_TYPES = [
  {
    key: 'kenko',
    label: '健康経営',
    signatureHeader: '★労働保険',
    urlPattern: 'kenko-houjin',
    productKeyword: '健康経営',
    sourceRule: 'partner',
    partnerSlugs: ['takacreww'],
  },
  {
    key: 'ai',
    label: 'AI導入補助金',
    signatureHeader: '★gBizIDプライム',
    urlPattern: 'surimun_invoice',
    productKeyword: 'AI導入補助金',
    sourceRule: 'raw',
    partnerSlugs: [],
  },
];

/**
 * 購入URLが当てはまらなくても、購入商品名で振り分けるかどうか。
 *
 * false … 移行前と同じ。購入URLだけで判定します。
 * true  … 購入URLが当てはまらない場合、購入商品名でも探します。
 *          新しいLPを作って購入URLが変わったときに取りこぼさなくなりますが、
 *          これまで案件管理シートに出てこなかった受注が出てくる場合があります。
 */
var ALSO_MATCH_BY_PRODUCT = false;

/** 代理店を経由しないときに流入元へ入れる文字 */
var DIRECT_SOURCE_LABEL = '本体';

/**
 * 「もう送らない」扱いにする対応状況。
 * この状態の案件は、テンプレ欄をすべて「-」にします（実際の送信ログがある分は除く）。
 */
var LOST_STATUSES = ['見送り'];

/** テンプレ欄に出す文字 */
var MARK = {
  NEXT: '★次',
  SENT_LOGGED: '送信済',
  SENT_ASSUMED: '送信済(推定)',
  NONE: '-',
  UNKNOWN: '?',
};

/** 送るものもアラートも無い日にサマリメールを送るか（false なら送らない） */
var SEND_EMPTY_DIGEST = false;

/** 毎朝の自動実行を何時台に走らせるか（0〜23／スクリプトのタイムゾーン基準） */
var TRIGGER_HOUR = 8;

/**
 * 読み込む行数の上限。
 * 移行前のシートは ARRAYFORMULA が下まで伸びていて、
 * 実データが数行でも最終行が2万行を超えます。
 * まず受注ID列だけを見て実際の行数を調べるので、無駄な読み込みをしません。
 */
var MAX_SCAN_ROWS = 50000;
