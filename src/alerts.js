/**
 * 日次サマリ
 *
 * 「今日どのメールを送るか（★次）」と「止まっている案件（アラート）」を
 * 1通のメールにまとめて送ります。
 * シートを開かなくても、その日にやることが分かるようにするのが目的です。
 */

/** 再計算してからサマリを送る（トリガーからも実行されます） */
function sendDailyDigest() {
  var ss = SpreadsheetApp.getActive();
  var today = new Date();

  var send = updateSendManagement_(ss, today);
  var projects = updateProjectSheets_(ss, today);

  var alerts = [];
  for (var i = 0; i < projects.length; i++) {
    alerts = alerts.concat(projects[i].alerts);
  }

  if (!send.next.length && !alerts.length && !SEND_EMPTY_DIGEST) {
    console.log('送るものもアラートもないため、サマリメールは送りませんでした。');
    return { sent: false, next: 0, alerts: 0 };
  }

  var recipients = getNotifyEmails_();
  if (!recipients.length) {
    console.log('送信先が分からないため、サマリメールを送れませんでした。');
    return { sent: false, next: send.next.length, alerts: alerts.length };
  }

  MailApp.sendEmail({
    to: recipients.join(','),
    subject: buildDigestSubject_(today, send.next.length, alerts.length),
    body: buildDigestBody_(ss, today, send.next, alerts, projects),
  });

  return { sent: true, next: send.next.length, alerts: alerts.length };
}

function buildDigestSubject_(today, nextCount, alertCount) {
  return '[ECフォース] ' + formatDate_(today) +
    ' 送信 ' + nextCount + '件 / アラート ' + alertCount + '件';
}

function buildDigestBody_(ss, today, next, alerts, projects) {
  var lines = [];

  lines.push(formatDate_(today) + ' のまとめ');
  lines.push('');

  lines.push('■ 今日送るメール（' + next.length + '件）');
  if (next.length) {
    for (var i = 0; i < next.length; i++) {
      var n = next[i];
      lines.push(
        '  受注' + n.orderId + '  ' +
        (String(n.company || '').trim() || String(n.name || '').trim() || '(名前なし)') +
        '  [' + n.templateId + '] ' + n.mailName +
        '  （現在: ' + String(n.status || '') + '）'
      );
    }
    lines.push('');
    lines.push('  送ったら 04_送信ログ に1行足して、ecforce の対応状況を次に進めてください。');
  } else {
    lines.push('  なし');
  }
  lines.push('');

  lines.push('■ 止まっている案件（' + alerts.length + '件）');
  if (alerts.length) {
    for (var a = 0; a < alerts.length; a++) {
      var x = alerts[a];
      lines.push(
        '  [' + x.label + '] 受注' + x.orderId + '  ' +
        (String(x.company || '').trim() || String(x.name || '').trim() || '(名前なし)') +
        '  → ' + x.alert
      );
    }
  } else {
    lines.push('  なし');
  }
  lines.push('');

  var orphans = 0;
  for (var p = 0; p < projects.length; p++) orphans += projects[p].orphans;
  if (orphans) {
    lines.push('■ 注意');
    lines.push('  抽出シートに無くなった案件が ' + orphans + '件あります。');
    lines.push('  手入力した内容は消さずに残してありますが、ecforce 側を確認してください。');
    lines.push('');
  }

  lines.push('シート: ' + ss.getUrl());
  lines.push('（このメールは Apps Script が自動で送っています）');

  return lines.join('\n');
}

/**
 * 送信先を決める。
 * スクリプトプロパティ NOTIFY_EMAILS（カンマ区切り）が最優先。
 * 無ければ、スクリプトを動かしている本人のアドレス。
 */
function getNotifyEmails_() {
  var raw = PropertiesService.getScriptProperties().getProperty(NOTIFY_EMAILS_PROPERTY);
  if (raw) {
    var list = raw.split(',').map(function (s) { return s.trim(); })
      .filter(function (s) { return s !== ''; });
    if (list.length) return list;
  }
  var self = Session.getEffectiveUser().getEmail();
  return self ? [self] : [];
}
