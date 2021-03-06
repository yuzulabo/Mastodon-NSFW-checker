let is_running = 1;
let admin_i = 0, admin_pm = false, whitelist = false, i = 0, acct_whitelist = "";
let config = require('./config');
let request = require('request');

if (!config.domain || !config.token ||
  !config.bot_id || !config.bot_admin || !config.discord_webhook_url) {
  console.log("ERROR!:config情報が不足しています！");
  process.exit();
}
main();
function main() {
  let WebSocketClient = require('websocket').client;
  let client = new WebSocketClient();

  client.on('connectFailed', function(error) {
    console.log('Connect Error: ' + error.toString());
    console.log('サーバとの接続に失敗しました。60秒後にリトライします...');
    setTimeout( function() {
      main();
    }, 60000);
  });

  client.on('connect', function(connection) {
    console.log('WebSocket Client Connected');
    connection.on('error', function(error) {
      console.log("Connection Error: " + error.toString());
      console.log('サーバとの接続に失敗しました。60秒後にリトライします...');
      setTimeout( function() {
        main();
      }, 60000);
    });
    connection.on('close', function() {
      console.log('サーバとの接続が切れました。60秒後にリトライします...');
      setTimeout( function() {
        main();
      }, 60000);
      //鯖落ち
    });
    connection.on('message', function(message) {
      //console.log(message);
      try {
        if (message.type === 'utf8') {
          let json = JSON.parse(JSON.parse(message.utf8Data).payload);
          if (json['account']) {
            let acct = json['account']['acct'];
            let text = json['content'];
            if (acct !== config.bot_id) {
              if (is_running) {
                //終了
                if (text.match(/!checker_stop/i)) {
                  admin_i = 0;
                  admin_pm = false;

                  while (config.bot_admin[admin_i]) {
                    if (acct === config.bot_admin[admin_i]) admin_pm = true;
                    admin_i++;
                  }

                  if (admin_pm) {
                    if (acct !== config.bot_admin[0]) {
                      post("@"+acct+" @"+config.bot_admin[0]+" 終了しました。", {}, "direct");
                    }
                    change_running(0);
                    console.log("OK:STOP:@"+acct);
                  }
                }

                if (json['media_attachments'][0] && !json['sensitive']) {
                  if (json['media_attachments'][0]["type"] === "image") {
                    i = 0;
                    whitelist = false;
                    acct_whitelist = "";

                    if (!acct.match(/@/i)) {
                      acct_whitelist = acct + "@" + config.domain;
                    } else {
                      acct_whitelist = acct;
                    }
                    if (config.whitelist.match(new RegExp(acct_whitelist, 'i'))) {
                      whitelist = true;
                    }

                    if (!whitelist) {
                      checkImage(json);
                    }
                  }
                }
              } else {
                if (acct === config.bot_admin[0]) {
                  if (text.match(/!checker_start/i)) {
                    change_running(1);
                    post("@"+ config.bot_admin[0] +" 起動しました。", {}, "direct");
                  }
                }
              }
            }
          }
        }
      } catch (e) {
        post("@"+ config.bot_admin[0] +" 【エラー検知】\n\n"+ e, {}, "direct");
        change_running(0);
      }
    });
  });

  client.connect("wss://" + config.domain + "/api/v1/streaming/?access_token=" + config.token + "&stream=public");
}

// ここからいろいろ

function send_discord(text, force) {
  if (is_running || force) {
    request.post({
      url: config.discord_webhook_url,
      formData: { content: text }
    }, function callback(err, httpResponse, body) {
      if (err) {
        console.error('request failed:', err);
        return;
      }
      console.log("OK:SEND");
    });
  }
}

function post(value, option = {}, visibility = "public", force) {
  var optiondata = {
    status: value,
    visibility: visibility
  };

  if (option.cw) {
    optiondata.spoiler_text = option.cw;
  }
  if (option.in_reply_to_id) {
    optiondata.in_reply_to_id = option.in_reply_to_id;
  }
  if (is_running || force) {
    request.post({
      url: "https://" + config.domain + "/api/v1/statuses",
      formData: optiondata,
      headers: {'Authorization': 'Bearer '+config.token}
    }, function callback(err, httpResponse, body) {
      if (err) {
        console.error('request failed:', err);
        return;
      }
      let resp = JSON.parse(body);
      if (resp["id"]) {
        console.log("OK:POST");
      } else {
        console.warn("NG:POST:"+body);
      }
    });
  }
}

function report(data, lv) {
  if (is_running) {
    request.post({
      url: "https://" + config.domain + "/api/v1/reports",
      formData: {
        'account_id': ""+data['account']['id'],
        'status_ids': [""+data['id']],
        'comment': '[BOT] AIがNSFWを検知 Lv: '+lv
      },
      headers: {'Authorization': 'Bearer '+config.token}
    }, function callback(err, httpResponse, body) {
      if (err) {
        console.error('request failed:', err);
        return;
      }
      let resp = JSON.parse(body);
      if (resp["id"]) {
        console.log("OK:POST:"+resp["id"]);
      } else {
        console.warn("NG:POST:"+body);
      }
    });
  }
}

function checkImage(data) {
  request.post({
    url: 'http://localhost:8080',
    formData: {
      'url': data['media_attachments'][0]["preview_url"],
    }
  }, function callback(err, httpResponse, body) {
    if (err) {
      console.error('request failed:', err);
      return;
    }
    let resp = +body;
    console.log(resp);
    if (resp >= 0.8) {
      //report(data, body);
      //post("Lv: " + resp, {in_reply_to_id: data['id']}, "private");
      send_discord("Lv: "+resp+"\nhttps://"+config.domain+"/web/statuses/"+data["id"]+"\nレポート用URL: ない")
    }
  });
}

function change_running(mode) {
  if (mode === 1) {
    is_running = 1;
    console.log("OK:START");
  } else {
    is_running = 0;
    console.log("OK:STOP");
  }
}