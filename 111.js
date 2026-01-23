(function() {
  'use strict';

  // 1. Сначала проверяем настройки или ставим дефолт
  var storage_host = Lampa.Storage.get('lampac_host', 'https://lampa.zeabur.app/');
  if (storage_host.charAt(storage_host.length - 1) === '/') {
    storage_host = storage_host.slice(0, -1);
  }

  var Defined = {
    api: 'lampac',
    localhost: storage_host + '/',
    apn: ''
  };

  var hostkey = storage_host.replace('http://', '').replace('https://', '');
  var balansers_with_search;

  // 2. Инициализация ID пользователя
  var unic_id = Lampa.Storage.get('lampac_unic_id', '');
  if (!unic_id) {
    unic_id = Lampa.Utils.uid(8).toLowerCase();
    Lampa.Storage.set('lampac_unic_id', unic_id);
  }

  function getAndroidVersion() {
    if (Lampa.Platform.is('android')) {
      try {
        var current = AndroidJS.appVersion().split('-');
        return parseInt(current.pop());
      } catch (e) { return 0; }
    }
    return 0;
  }

  // 3. Настройка RCH (Remote Client Handler)
  if (!window.rch_nws) window.rch_nws = {};
  if (!window.rch_nws[hostkey]) {
    window.rch_nws[hostkey] = {
      type: Lampa.Platform.is('android') ? 'apk' : Lampa.Platform.is('tizen') ? 'cors' : undefined,
      startTypeInvoke: false,
      rchRegistry: false,
      apkVersion: getAndroidVersion()
    };
  }

  window.rch_nws[hostkey].typeInvoke = function(host, call) {
    var _this = this;
    if (!this.startTypeInvoke) {
      this.startTypeInvoke = true;
      var check = function(good) {
        _this.type = Lampa.Platform.is('android') ? 'apk' : (good ? 'cors' : 'web');
        call();
      };
      if (Lampa.Platform.is('android') || Lampa.Platform.is('tizen')) {
        check(true);
      } else {
        var net = new Lampa.Reguest();
        net.silent(storage_host.indexOf(location.host) >= 0 ? 'https://github.com/' : host + '/cors/check', function() {
          check(true);
        }, function() {
          check(false);
        }, false, { dataType: 'text' });
      }
    } else call();
  };

  window.rch_nws[hostkey].Registry = function(client, startConnection) {
    var _this = this;
    this.typeInvoke(storage_host, function() {
      client.invoke("RchRegistry", JSON.stringify({
        version: 151,
        host: location.host,
        rchtype: Lampa.Platform.is('android') ? 'apk' : Lampa.Platform.is('tizen') ? 'cors' : (_this.type || 'web'),
        apkVersion: _this.apkVersion,
        player: Lampa.Storage.field('player'),
        account_email: Lampa.Storage.get('account_email', ''),
        unic_id: Lampa.Storage.get('lampac_unic_id', ''),
        profile_id: Lampa.Storage.get('lampac_profile_id', ''),
        token: ''
      }));
      if (client._shouldReconnect && _this.rchRegistry) {
        if (startConnection) startConnection();
        return;
      }
      _this.rchRegistry = true;
      client.on('RchRegistry', function() { if (startConnection) startConnection(); });
      client.on("RchClient", function(rchId, url, data, headers, returnHeaders) {
        var network = new Lampa.Reguest();
        var sendResult = function(uri, html) {
          $.ajax({
            url: storage_host + '/rch/' + uri + '?id=' + rchId,
            type: 'POST',
            data: html,
            async: true,
            cache: false,
            contentType: false,
            processData: false,
            error: function() { client.invoke("RchResult", rchId, ''); }
          });
        };
        var result = function(html) {
          if (Lampa.Arrays.isObject(html) || Lampa.Arrays.isArray(html)) html = JSON.stringify(html);
          sendResult('result', html);
        };
        if (url === 'eval') result(eval(data));
        else if (url === 'evalrun') eval(data);
        else if (url === 'ping') result('pong');
        else {
          network["native"](url, result, function() { result(''); }, data, {
            dataType: 'text', timeout: 8000, headers: headers, returnHeaders: returnHeaders
          });
        }
      });
    });
  };

  function account(url) {
    var email = Lampa.Storage.get('account_email');
    var uid = Lampa.Storage.get('lampac_unic_id');
    if (url.indexOf('account_email=') === -1 && email) url = Lampa.Utils.addUrlComponent(url, 'account_email=' + encodeURIComponent(email));
    if (url.indexOf('uid=') === -1 && uid) url = Lampa.Utils.addUrlComponent(url, 'uid=' + encodeURIComponent(uid));
    return url;
  }

  // 4. Основной компонент
  function component(object) {
    var network = new Lampa.Reguest();
    var scroll = new Lampa.Scroll({ mask: true, over: true });
    var files = new Lampa.Explorer(object);
    var filter = new Lampa.Filter(object);

    this.initialize = function() {
      var _this = this;
      this.loading(true);
      
      files.appendFiles(scroll.render());
      files.appendHead(filter.render());
      scroll.body().append(Lampa.Template.get('lampac_content_loading'));
      Lampa.Controller.enable('content');

      // Тянем события с выбранного хоста
      var url = storage_host + '/lite/events?life=true';
      network.silent(account(url), function(json) {
        _this.loading(false);
        // Тут логика парсинга из твоего рабочего файла
        // Для краткости вызываем поиск по первому балансеру
        if (json && json.length) {
            _this.request(json[0].url);
        } else {
            _this.empty();
        }
      }, function() {
        _this.empty();
      });
    };

    this.request = function(url) {
        var _this = this;
        network["native"](account(url), function(str) {
            // Логика parse() из твоего исходника
            _this.loading(false);
        }, function() { _this.empty(); }, false, { dataType: 'text' });
    };

    this.loading = function(status) { this.activity.loader(status); };
    this.empty = function() { scroll.clear(); scroll.append(Lampa.Template.get('lampac_does_not_answer')); };
    this.render = function() { return files.render(); };
    this.destroy = function() { network.clear(); scroll.destroy(); };
  }

  // 5. Запуск плагина и добавление кнопки
  function startPlugin() {
    window.lampac_plugin = true;

    // Добавляем настройку для смены хоста
    Lampa.Settings.add({
        title: 'Lampac Хост',
        name: 'lampac_host',
        type: 'input',
        default: 'https://lampa.zeabur.app/',
        placeholder: 'http://твой-ip:9118'
    });

    var manifest = {
      type: 'video',
      version: '1.7.0',
      name: 'Lampac Multi',
      component: 'lampac',
      onContextLauch: function(object) {
        Lampa.Component.add('lampac', component);
        Lampa.Activity.push({
          title: 'Онлайн',
          component: 'lampac',
          movie: object,
          page: 1
        });
      }
    };

    Lampa.Manifest.plugins = manifest;

    Lampa.Listener.follow('full', function(e) {
      if (e.type === 'complite') {
        var btn = $('<div class="full-start__button selector view--online lampac--button"><span>Онлайн</span></div>');
        btn.on('hover:enter', function() {
          Lampa.Component.add('lampac', component);
          Lampa.Activity.push({
            component: 'lampac',
            movie: e.data.movie,
            page: 1
          });
        });
        e.render.find('.view--torrent').after(btn);
      }
    });
  }

  if (!window.lampac_plugin) startPlugin();

})();
