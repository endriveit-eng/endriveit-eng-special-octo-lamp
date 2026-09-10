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

/** 書類欄で「そろった」とみなす値 */
var DOC_DONE_VALUES = ['受領', '対象外'];

/**
 * 案件管理シートの種類。
 * シート名ではなく「そのシートにしかない見出し」で見分けるので、
 * タブ名を変えても動きます。
 */
var PROJECT_SHEET_TYPES = [
  {
    key: 'kenko',
    label: '健康経営',
    // 抽出シートの「購入商品（商品名）」にこの文字が含まれる行を取り込む
    productKeyword: '健康経営',
    // このシートにしかない見出し
    signatureHeader: '★労働保険',
    // 流入元の求め方（'slug' = 購入URLから代理店名を切り出す / 'raw' = 購入URLそのまま）
    sourceRule: 'slug',
    // sourceRule が 'slug' のときに購入URLから取り除く先頭の文字
    sourcePrefix: 'kenko-houjin',
  },
  {
    key: 'ai',
    label: 'AI導入補助金',
    productKeyword: 'AI導入補助金',
    signatureHeader: '★gBizIDプライム',
    sourceRule: 'raw',
    sourcePrefix: '',
  },
];

/** 自社経由（代理店を経由しない）ときに流入元へ入れる文字 */
var DIRECT_SOURCE_LABEL = '本体';

/**
 * 日次サマリの送信先。
 * ここには書かず、スクリプトプロパティ NOTIFY_EMAILS にカンマ区切りで入れてください
 * （拡張機能 → Apps Script → プロジェクトの設定 → スクリプト プロパティ）。
 * 未設定なら、実行した本人のアドレスに送ります。
 */
var NOTIFY_EMAILS_PROPERTY = 'NOTIFY_EMAILS';

/**
 * 「もう送らない」扱いにする対応状況。
 * この状態の案件は、テンプレ欄をすべて「-」にします（実際の送信ログがある分は除く）。
 */
var LOST_STATUSES = ['見送り'];

/** テンプレ欄に出す文字 */
var MARK = {
  NEXT: '★次',          // いま送るべきもの
  SENT_LOGGED: '送信済',      // 04_送信ログ に記録があるもの（事実）
  SENT_ASSUMED: '送信済(推定)', // 対応状況から通過済とみなしたもの（記録なし）
  NONE: '-',            // まだ先、または送らないもの
  UNKNOWN: '?',         // 対応状況がマスタに無い
};

/** 送るものもアラートも無い日にサマリメールを送るか（false なら送らない） */
var SEND_EMPTY_DIGEST = false;

/** 毎朝の自動実行を何時台に走らせるか（0〜23／スクリプトのタイムゾーン基準） */
var TRIGGER_HOUR = 8;
