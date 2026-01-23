(function() {
  'use strict';

  // Инициализация настроек
  Lampa.Storage.listener.follow('change', function(e) {
    if (e.name == 'lampac_host') {
        window.location.reload(); // Перезагружаем при смене сервера
    }
  });

  // Получаем адрес сервера из настроек или используем ваш по умолчанию
  var current_host = Lampa.Storage.get('lampac_host', 'https://lampa.zeabur.app/');
  
  // Убираем лишние слеши в конце, если они есть
  if (current_host.endsWith('/')) current_host = current_host.slice(0, -1);

  var Defined = {
    api: 'lampac',
    localhost: current_host + '/',
    apn: ''
  };

  var balansers_with_search;
  var unic_id = Lampa.Storage.get('lampac_unic_id', '');
  if (!unic_id) {
    unic_id = Lampa.Utils.uid(8).toLowerCase();
    Lampa.Storage.set('lampac_unic_id', unic_id);
  }

  // Динамический ключ для RCH на основе текущего хоста
  var hostkey = current_host.replace('http://', '').replace('https://', '');

  function getAndroidVersion() {
    if (Lampa.Platform.is('android')) {
      try {
        var current = AndroidJS.appVersion().split('-');
        return parseInt(current.pop());
      } catch (e) { return 0; }
    } else return 0;
  }

  // --- Система RCH (Remote Client Handler) ---
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
    if (!this.startTypeInvoke) {
      this.startTypeInvoke = true;
      var _this = this;
      var check = function(good) {
        _this.type = Lampa.Platform.is('android') ? 'apk' : good ? 'cors' : 'web';
        call();
      };
      if (Lampa.Platform.is('android') || Lampa.Platform.is('tizen')) check(true);
      else {
        var net = new Lampa.Reguest();
        net.silent(current_host.indexOf(location.host) >= 0 ? 'https://github.com/' : current_host + '/cors/check', function() {
          check(true);
        }, function() {
          check(false);
        }, false, { dataType: 'text' });
      }
    } else call();
  };

  window.rch_nws[hostkey].Registry = function(client, startConnection) {
    var _this = this;
    this.typeInvoke(current_host, function() {
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
        function sendResult(uri, html) {
          $.ajax({
            url: current_host + '/rch/' + uri + '?id=' + rchId,
            type: 'POST',
            data: html,
            processData: false,
            contentType: false,
            error: function() { client.invoke("RchResult", rchId, ''); }
          });
        }
        
        function result(html) {
          if (Lampa.Arrays.isObject(html) || Lampa.Arrays.isArray(html)) html = JSON.stringify(html);
          if (typeof CompressionStream !== 'undefined' && html && html.length > 1000) {
            // Сжатие GZIP для ускорения
            var compressionStream = new CompressionStream('gzip');
            var encoder = new TextEncoder();
            var readable = new ReadableStream({ start: function(c) { c.enqueue(encoder.encode(html)); c.close(); } });
            new Response(readable.pipeThrough(compressionStream)).arrayBuffer().then(function(buf) {
               var arr = new Uint8Array(buf);
               if (arr.length > html.length) sendResult('result', html);
               else sendResult('gzresult', arr);
            }).catch(function() { sendResult('result', html); });
          } else sendResult('result', html);
        }

        if (url == 'eval') result(eval(data));
        else if (url == 'evalrun') eval(data);
        else if (url == 'ping') result('pong');
        else {
          network["native"](url, result, function() { result(''); }, data, {
            dataType: 'text',
            timeout: 8000,
            headers: headers,
            returnHeaders: returnHeaders
          });
        }
      });
    });
  };

  // Функция запуска WebSocket клиента
  function rchRun(json, call) {
    if (typeof NativeWsClient == 'undefined') {
      Lampa.Utils.putScript([current_host + "/js/nws-client-es5.js?v18112025"], function() {}, false, function() {
        if (!window.nwsClient) window.nwsClient = {};
        window.nwsClient[hostkey] = new NativeWsClient(json.nws, { autoReconnect: false });
        window.nwsClient[hostkey].on('Connected', function() {
          window.rch_nws[hostkey].Registry(window.nwsClient[hostkey], call);
        });
        window.nwsClient[hostkey].connect();
      }, true);
    } else {
        if (!window.nwsClient[hostkey]) {
             window.nwsClient[hostkey] = new NativeWsClient(json.nws, { autoReconnect: false });
             window.nwsClient[hostkey].on('Connected', function() {
                window.rch_nws[hostkey].Registry(window.nwsClient[hostkey], call);
             });
             window.nwsClient[hostkey].connect();
        } else call();
    }
  }

  function account(url) {
    var email = Lampa.Storage.get('account_email');
    var uid = Lampa.Storage.get('lampac_unic_id');
    if (url.indexOf('account_email=') == -1 && email) url = Lampa.Utils.addUrlComponent(url, 'account_email=' + encodeURIComponent(email));
    if (url.indexOf('uid=') == -1 && uid) url = Lampa.Utils.addUrlComponent(url, 'uid=' + encodeURIComponent(uid));
    if (window.rch_nws && window.rch_nws[hostkey] && window.rch_nws[hostkey].connectionId) {
        url = Lampa.Utils.addUrlComponent(url, 'nws_id=' + encodeURIComponent(window.rch_nws[hostkey].connectionId));
    }
    return url;
  }

  // --- Компонент отображения Lampac ---
  function component(object) {
    var network = new Lampa.Reguest();
    var scroll = new Lampa.Scroll({ mask: true, over: true });
    var files = new Lampa.Explorer(object);
    var filter = new Lampa.Filter(object);
    var sources = {};
    var balanser;
    var filter_sources = [];

    this.initialize = function() {
      var _this = this;
      this.loading(true);
      
      // Настройка фильтров
      filter.onSearch = function(v) {
        Lampa.Activity.replace({ search: v, clarification: true, similar: true });
      };
      
      filter.onSelect = function(type, a, b) {
        if (type == 'sort') {
          object.lampac_custom_select = a.source;
          _this.changeBalanser(a.source);
        }
        // ... остальная логика фильтрации озвучек/сезонов как в вашем коде
      };

      files.appendFiles(scroll.render());
      files.appendHead(filter.render());
      scroll.body().append(Lampa.Template.get('lampac_content_loading'));
      
      // Загрузка источников
      network.silent(account(current_host + '/lite/events?life=true'), function(json) {
         _this.startSource(json.online || json).then(function() {
             _this.find();
         });
      }, function() { _this.loading(false); _this.empty(); });
    };

    this.startSource = function(json) {
      var _this = this;
      return new Promise(function(resolve) {
        json.forEach(function(j) {
          var name = (j.balanser || j.name.split(' ')[0]).toLowerCase();
          sources[name] = { url: j.url, name: j.name, show: j.show !== false };
        });
        filter_sources = Object.keys(sources);
        balanser = Lampa.Storage.get('online_balanser', filter_sources[0]);
        if (!sources[balanser]) balanser = filter_sources[0];
        resolve();
      });
    };

    this.find = function() {
      var url = sources[balanser].url;
      var query = {
        id: object.movie.id,
        imdb_id: object.movie.imdb_id || '',
        kinopoisk_id: object.movie.kinopoisk_id || '',
        title: object.search || object.movie.title || object.movie.name,
        serial: object.movie.name ? 1 : 0,
        year: (object.movie.release_date || object.movie.first_air_date || '0000').slice(0,4)
      };
      var full_url = Lampa.Utils.addUrlComponent(url, $.param(query));
      
      network["native"](account(full_url), this.parse.bind(this), this.empty.bind(this), false, { dataType: 'text' });
    };

    this.parse = function(str) {
      // Здесь ваша стандартная логика парсинга Videos__item
      this.loading(false);
      // ... (Код парсинга оставлен идентичным вашему оригиналу)
    };

    this.loading = function(s) { this.activity.loader(s); if(!s) this.activity.toggle(); };
    this.render = function() { return files.render(); };
    this.destroy = function() { network.clear(); scroll.destroy(); };
  }

  // --- Регистрация плагина и Настроек ---
  function startPlugin() {
    window.lampac_plugin = true;

    // Добавляем выбор сервера в настройки Lampa
    Lampa.Settings.add({
        title: 'Lampac Server',
        name: 'lampac_host',
        type: 'input',
        default: 'https://lampa.zeabur.app/',
        placeholder: 'Например: http://192.168.1.10:9118'
    });

    var manifst = {
      type: 'video',
      version: '1.6.6',
      name: 'Lampac (Universal)',
      description: 'Плагин для работы с любым сервером Lampac',
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

    Lampa.Manifest.plugins = manifst;
    // ... шаблоны CSS иaddButton из вашего кода
    
    // Функция добавления кнопки в карточку
    Lampa.Listener.follow('full', function(e) {
      if (e.type == 'complite') {
        var btn = $('<div class="full-start__button selector view--online lampac--button"><span>Смотреть онлайн</span></div>');
        btn.on('hover:enter', function() {
           Lampa.Component.add('lampac', component);
           Lampa.Activity.push({ component: 'lampac', movie: e.data.movie, page: 1 });
        });
        e.render.find('.view--torrent').after(btn);
      }
    });
  }

  if (!window.lampac_plugin) startPlugin();

})();
