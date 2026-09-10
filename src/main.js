/**
 * 入口（メニュー・トリガー）
 *
 * 普段の操作はスプレッドシート上部の「運用ツール」メニューから行います。
 */

/** スプレッドシートを開いたときにメニューを出す */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('運用ツール')
    .addItem('全部まとめて更新', 'refreshAll')
    .addSeparator()
    .addItem('03_送信管理 を更新', 'updateSendManagement')
    .addItem('案件管理シート を更新', 'updateProjectSheets')
    .addSeparator()
    .addItem('今日のまとめをメールで送る', 'sendDailyDigest')
    .addSeparator()
    .addItem('毎朝の自動実行をオンにする', 'installTriggers')
    .addItem('毎朝の自動実行をオフにする', 'removeTriggers')
    .addToUi();
}

/** 案件管理シートと送信管理をまとめて更新する */
function refreshAll() {
  var ss = SpreadsheetApp.getActive();
  var today = new Date();

  var projects = updateProjectSheets_(ss, today);
  var send = updateSendManagement_(ss, today);

  var alertCount = 0;
  var orphanCount = 0;
  for (var i = 0; i < projects.length; i++) {
    alertCount += projects[i].alerts.length;
    orphanCount += projects[i].orphans;
  }

  var message = '送信管理 ' + send.rows + '件（★次 ' + send.nextCount + '件）' +
    ' / アラート ' + alertCount + '件';
  if (orphanCount) message += ' / 抽出に無し ' + orphanCount + '件';

  ss.toast(message, '更新しました', 8);
  return { send: send, projects: projects };
}

/** 毎朝の自動実行を仕掛ける（既にあるものは作り直す） */
function installTriggers() {
  removeTriggers();

  ScriptApp.newTrigger('sendDailyDigest')
    .timeBased()
    .atHour(TRIGGER_HOUR)
    .everyDays(1)
    .create();

  SpreadsheetApp.getActive().toast(
    '毎日 ' + TRIGGER_HOUR + '時台に自動で更新し、まとめをメールします。',
    '自動実行オン',
    8
  );
}

/** このスクリプトが作った自動実行をすべて外す */
function removeTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  var removed = 0;
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'sendDailyDigest') {
      ScriptApp.deleteTrigger(triggers[i]);
      removed++;
    }
  }
  return removed;
}
