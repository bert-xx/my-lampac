(function() {
  'use strict';

  // Функция для получения текущего хоста из настроек
  function getHost() {
    var host = Lampa.Storage.get('lampac_host_url', '');
    if (host && host.charAt(host.length - 1) === '/') {
      host = host.slice(0, -1);
    }
    return host;
  }

  // Настройка RCH под динамический хост
  function initRCH(host) {
    if (!host) return;
    var hostkey = host.replace('http://', '').replace('https://', '');
    
    if (!window.rch_nws) window.rch_nws = {};
    if (!window.rch_nws[hostkey]) {
      window.rch_nws[hostkey] = {
        type: Lampa.Platform.is('android') ? 'apk' : Lampa.Platform.is('tizen') ? 'cors' : 'web',
        startTypeInvoke: true,
        rchRegistry: false
      };
    }

    window.rch_nws[hostkey].Registry = function(client, startConnection) {
      client.invoke("RchRegistry", JSON.stringify({
        version: 151,
        host: location.host,
        rchtype: window.rch_nws[hostkey].type,
        player: Lampa.Storage.field('player'),
        unic_id: Lampa.Storage.get('lampac_unic_id', '')
      }));

      client.on("RchClient", function(rchId, url, data, headers, returnHeaders) {
        var network = new Lampa.Reguest();
        network["native"](url, function(result) {
          $.ajax({
            url: host + '/rch/result?id=' + rchId,
            type: 'POST',
            data: typeof result === 'string' ? result : JSON.stringify(result),
            processData: false, 
            contentType: false
          });
        }, function() {
          client.invoke("RchResult", rchId, '');
        }, data, { 
          dataType: 'text', 
          timeout: 8000, 
          headers: headers, 
          returnHeaders: returnHeaders 
        });
      });
      
      if (startConnection) startConnection();
    };
  }

  function account(url) {
    var email = Lampa.Storage.get('account_email', '');
    var uid = Lampa.Storage.get('lampac_unic_id', '');
    if (url.indexOf('account_email=') === -1 && email) {
      url = Lampa.Utils.addUrlComponent(url, 'account_email=' + encodeURIComponent(email));
    }
    if (url.indexOf('uid=') === -1 && uid) {
      url = Lampa.Utils.addUrlComponent(url, 'uid=' + encodeURIComponent(uid));
    }
    return url;
  }

  // Компонент плагина
  function component(object) {
    var network = new Lampa.Reguest();
    var scroll = new Lampa.Scroll({ mask: true, over: true });
    var files = new Lampa.Explorer(object);
    var filter = new Lampa.Filter(object);
    var host = getHost();
    var active = 0;

    this.create = function() {
      var _this = this;
      
      // Проверка наличия хоста
      if (!host) {
        Lampa.Noty.show('Укажите адрес сервера Lampac в настройках!');
        Lampa.Activity.backward();
        return;
      }

      this.activity.loader(true);
      initRCH(host);

      files.appendFiles(scroll.render());
      files.appendHead(filter.render());
      
      // Добавляем индикатор загрузки
      scroll.append($('<div class="broadcast__text">Загрузка...</div>'));

      // Формируем URL запроса
      var movieTitle = object.movie.title || object.movie.name || '';
      var url = host + '/lite/events?id=' + object.movie.id + '&title=' + encodeURIComponent(movieTitle);
      
      console.log('Lampac: запрос к', url);

      network.silent(account(url), function(json) {
        console.log('Lampac: получен ответ', json);
        _this.activity.loader(false);
        
        // Обработка разных форматов ответа
        var items = json.online || json.results || json;
        if (Array.isArray(items)) {
          _this.buildList(items);
        } else {
          console.error('Lampac: неверный формат ответа', json);
          _this.empty('Неверный формат ответа от сервера');
        }
      }, function(error) {
        console.error('Lampac: ошибка запроса', error);
        _this.activity.loader(false);
        _this.empty('Ошибка подключения к серверу');
      });

      return files.render();
    };

    this.buildList = function(items) {
      var _this = this;
      scroll.clear();
      
      if (!items || items.length === 0) {
        return this.empty('Онлайн источники не найдены');
      }

      items.forEach(function(item, index) {
        var title = item.name || item.title || 'Источник ' + (index + 1);
        var subtitle = item.balanser || item.balancer || 'Неизвестный балансер';
        
        var card = Lampa.Template.get('button_card', { 
          title: title, 
          subtitle: subtitle 
        });
        
        card.on('hover:focus', function() {
          active = index;
        });

        card.on('hover:enter', function() {
          if (item.url) {
            _this.playVideo(item);
          } else {
            Lampa.Noty.show('URL не найден для этого источника');
          }
        });
        
        scroll.append(card);
      });
      
      Lampa.Controller.enable('content');
    };

    this.playVideo = function(item) {
      var movieTitle = object.movie.title || object.movie.name || 'Видео';
      
      var playObject = {
        url: item.url,
        title: movieTitle,
        subtitle: item.name || '',
        card: object.movie
      };

      console.log('Lampac: запуск видео', playObject);
      Lampa.Player.play(playObject);
      Lampa.Player.playlist([playObject]);
    };

    this.empty = function(message) {
      scroll.clear();
      var emptyDiv = $('<div class="broadcast__text">' + (message || 'Ничего не найдено') + '</div>');
      scroll.append(emptyDiv);
      Lampa.Controller.enable('content');
    };

    this.start = function() {
      Lampa.Controller.add('content', {
        toggle: function() { 
          Lampa.Controller.collectionSet(scroll.render()); 
          Lampa.Controller.collectionFocus(active, scroll.render()); 
        },
        up: function() { 
          if (Lampa.Navigator.canmove('up')) Lampa.Controller.toggle('head'); 
        },
        left: function() { 
          if (Lampa.Navigator.canmove('left')) Lampa.Activity.backward(); 
        },
        down: function() {},
        right: function() {},
        back: function() { 
          Lampa.Activity.backward(); 
        }
      });
      Lampa.Controller.toggle('content');
    };

    this.pause = function() {};
    this.stop = function() {};
    this.render = function() { return files.render(); };
    this.destroy = function() { 
      network.clear(); 
      scroll.destroy(); 
      files.destroy();
    };
  }

  // Настройка плагина
  function startPlugin() {
    if (window.lampac_plugin_loaded) return;
    window.lampac_plugin_loaded = true;

    console.log('Lampac: инициализация плагина');

    // Добавляем настройки в меню
    Lampa.SettingsApi.addComponent({
      component: 'lampac_settings',
      name: 'Lampac',
      icon: '<svg viewBox="0 0 24 24"><path d="M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22A10,10 0 0,1 2,12A10,10 0 0,1 12,2M12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20A8,8 0 0,0 20,12A8,8 0 0,0 12,4Z" /></svg>'
    });

    Lampa.SettingsApi.addParam({
      component: 'lampac_settings',
      param: {
        name: 'lampac_host_url',
        type: 'input',
        default: '',
        placeholder: 'http://192.168.1.10:9118',
        values: ''
      },
      field: {
        name: 'URL сервера Lampac',
        description: 'Укажите полный адрес вашего сервера Lampac'
      },
      onChange: function(value) {
        console.log('Lampac: изменен URL сервера на', value);
      }
    });

    // Регистрируем компонент
    Lampa.Component.add('lampac_universal', component);

    // Добавляем кнопку "Онлайн" на странице фильма/сериала
    Lampa.Listener.follow('full', function(e) {
      if (e.type === 'complite') {
        var btn = $('<div class="full-start__button selector view--online"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22A10,10 0 0,1 2,12A10,10 0 0,1 12,2M10,16.5L16,12L10,7.5V16.5Z" fill="currentColor"/></svg><span>Онлайн</span></div>');
        
        btn.on('hover:enter', function() {
          Lampa.Activity.push({
            title: 'Онлайн источники',
            component: 'lampac_universal',
            movie: e.data.movie,
            page: 1
          });
        });
        
        e.render.find('.full-start__buttons').append(btn);
      }
    });

    console.log('Lampac: плагин успешно загружен');
  }

  // Запуск плагина
  if (window.Lampa) {
    startPlugin();
  } else {
    document.addEventListener('DOMContentLoaded', startPlugin);
  }

})();
