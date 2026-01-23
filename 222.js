(function() {
  'use strict';

  console.log('=== УНИВЕРСАЛЬНЫЙ ОНЛАЙН ПЛАГИН: Загрузка ===');

  // Настройки балансеров
  var BALANCERS_LIST = [
    'filmix', 'filmixtv', 'fxapi', 'rezka', 'hdrezka', 'rhsprem', 
    'lumex', 'videodb', 'collaps', 'hdvb', 'zetflix', 'kodik', 
    'ashdi', 'kinoukr', 'remux', 'iframevideo', 'cdnmovies', 
    'alloha', 'kinopub', 'vibix', 'vdbmovies', 'fancdn', 
    'vokino', 'vcdn', 'videocdn', 'mirage', 'hydraflix',
    'videasy', 'vidsrc', 'movpi', 'vidlink', 'twoembed', 
    'autoembed', 'smashystream', 'rgshows', 'pidtor', 'videoseed'
  ];

  // Получение хоста из настроек
  function getHost() {
    var host = Lampa.Storage.get('online_plugin_host', '');
    if (!host) {
      // Если нет настроек, спрашиваем у пользователя
      return '';
    }
    if (host.charAt(host.length - 1) === '/') {
      host = host.slice(0, -1);
    }
    return host;
  }

  // Компонент плагина
  function component(object) {
    var network = new Lampa.Reguest();
    var scroll = new Lampa.Scroll({ mask: true, over: true });
    var files = new Lampa.Explorer(object);
    var filter = new Lampa.Filter(object);
    var balanser = Lampa.Storage.get('online_balanser', 'filmix');
    var host = getHost();

    var active = 0;
    var items = [];
    var html = $('<div></div>');
    var contextmenu_all = [];

    this.create = function() {
      var _this = this;
      
      if (!host) {
        Lampa.Noty.show('⚙️ Укажите адрес сервера в настройках плагина');
        setTimeout(function() {
          Lampa.Activity.backward();
        }, 2000);
        return html;
      }

      this.activity.loader(true);
      
      html.append(files.render());
      files.appendHead(filter.render());
      scroll.render().addClass('layer--wheight').data('mheight', files.render());
      files.appendFiles(scroll.render());
      
      // Добавляем индикатор загрузки
      scroll.append(Lampa.Template.get('lampac_content_loading', {}, true));

      this.search();
      return html;
    };

    this.search = function() {
      var _this = this;
      
      var search_title = object.search || object.movie.title || object.movie.name;
      var kinopoisk_id = object.movie.id || object.movie.kinopoisk_id || '';
      var imdb_id = object.movie.imdb_id || '';
      
      console.log('ОНЛАЙН: Поиск -', search_title, 'KP:', kinopoisk_id, 'IMDB:', imdb_id);

      var url = host + '/lite/events';
      var params = [];
      
      if (kinopoisk_id) params.push('id=' + kinopoisk_id);
      if (search_title) params.push('title=' + encodeURIComponent(search_title));
      if (imdb_id) params.push('imdb_id=' + imdb_id);
      if (balanser) params.push('balanser=' + balanser);
      
      if (params.length) url += '?' + params.join('&');
      
      console.log('ОНЛАЙН: URL запроса -', url);

      network.silent(url, function(json) {
        console.log('ОНЛАЙН: Получен ответ -', json);
        _this.activity.loader(false);
        _this.parse(json);
      }, function(error) {
        console.error('ОНЛАЙН: Ошибка -', error);
        _this.activity.loader(false);
        _this.doesNotAnswer();
      });
    };

    this.parse = function(json) {
      var _this = this;
      scroll.clear();

      // Парсим ответ в разных форматах
      items = json.online || json.results || json.data || (Array.isArray(json) ? json : []);
      
      console.log('ОНЛАЙН: Найдено источников -', items.length);

      if (!items || items.length === 0) {
        this.doesNotAnswer();
        return;
      }

      items.forEach(function(element, index) {
        var item = _this.renderItem(element, index);
        if (item) scroll.append(item);
      });

      Lampa.Controller.enable('content');
    };

    this.renderItem = function(element, index) {
      var _this = this;
      
      var title = element.title || element.name || element.season_title || 'Источник ' + (index + 1);
      var quality = element.quality || element.max_quality || '';
      var info = [];
      
      if (element.translation) info.push(element.translation);
      if (element.episodes) info.push(element.episodes + ' эп.');
      if (quality) info.push(quality);

      var data = {
        title: title,
        quality: quality,
        info: info.join(' • '),
        time: ''
      };

      var card;
      
      // Если это папка (сезоны)
      if (element.folder) {
        card = Lampa.Template.get('lampac_prestige_folder', data);
      } else {
        card = Lampa.Template.get('lampac_prestige_full', data);
      }

      card.on('hover:focus', function() {
        active = index;
      });

      card.on('hover:enter', function() {
        if (element.url) {
          _this.playVideo(element);
        } else if (element.folder) {
          // Открываем папку с эпизодами
          _this.openFolder(element);
        } else {
          Lampa.Noty.show('❌ Нет ссылки для воспроизведения');
        }
      });

      return card;
    };

    this.playVideo = function(element) {
      console.log('ОНЛАЙН: Запуск видео -', element);
      
      var playlist = [];
      var video = {
        url: element.url || element.link,
        title: object.movie.title || object.movie.name,
        subtitle: element.title || element.name || ''
      };

      playlist.push(video);

      Lampa.Player.play(video);
      Lampa.Player.playlist(playlist);
    };

    this.openFolder = function(element) {
      console.log('ОНЛАЙН: Открытие папки -', element);
      
      Lampa.Activity.push({
        url: '',
        title: element.title || 'Эпизоды',
        component: 'online_episodes',
        folder: element,
        movie: object.movie,
        page: 1
      });
    };

    this.doesNotAnswer = function() {
      scroll.clear();
      
      var empty = Lampa.Template.get('lampac_does_not_answer', {
        balanser: balanser
      }, true);
      
      scroll.append(empty);
      
      empty.find('.change').on('hover:enter', function() {
        Lampa.Activity.backward();
      });
      
      empty.find('.cancel').on('hover:enter', function() {
        Lampa.Activity.backward();
      });

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
        down: function() {
          if (Lampa.Navigator.canmove('down')) Lampa.Controller.toggle('content');
        },
        left: function() {
          if (Lampa.Navigator.canmove('left')) Lampa.Activity.backward();
        },
        right: function() {},
        back: function() {
          Lampa.Activity.backward();
        }
      });
      
      Lampa.Controller.toggle('content');
    };

    this.pause = function() {};
    this.stop = function() {};
    this.render = function() { return html; };
    this.destroy = function() {
      network.clear();
      scroll.destroy();
      files.destroy();
      html.remove();
    };
  }

  function startPlugin() {
    if (window.online_universal_plugin) {
      console.log('ОНЛАЙН: Плагин уже загружен');
      return;
    }

    window.online_universal_plugin = true;
    console.log('ОНЛАЙН: Инициализация плагина...');

    // Добавляем переводы
    Lampa.Lang.add({
      online_plugin_title: {
        ru: 'Онлайн Просмотр',
        en: 'Online Watch',
        uk: 'Онлайн Перегляд'
      },
      online_plugin_host: {
        ru: 'Адрес сервера',
        en: 'Server address',
        uk: 'Адреса сервера'
      }
    });

    // Добавляем CSS стили
    if (!$('#online-plugin-styles').length) {
      Lampa.Template.add('online_css', `
        <style id="online-plugin-styles">
          .online-prestige{position:relative;border-radius:.3em;background-color:rgba(0,0,0,0.3);display:flex;margin-bottom:1.5em}
          .online-prestige__body{padding:1.2em;line-height:1.3;flex-grow:1;position:relative}
          .online-prestige__img{position:relative;width:13em;flex-shrink:0;min-height:8.2em}
          .online-prestige__img>img{position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;border-radius:.3em}
          .online-prestige__folder{padding:1em;flex-shrink:0}
          .online-prestige__folder>svg{width:4.4em!important;height:4.4em!important}
          .online-prestige__title{font-size:1.7em;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical}
          .online-prestige__info{display:flex;align-items:center;margin-top:0.5em}
          .online-prestige__quality{padding-left:1em;white-space:nowrap}
          .online-prestige.focus::after{content:'';position:absolute;top:-0.6em;left:-0.6em;right:-0.6em;bottom:-0.6em;border-radius:.7em;border:solid .3em #fff;z-index:-1}
        </style>
      `);
      $('body').append(Lampa.Template.get('online_css', {}, true));
    }

    // Добавляем шаблоны
    Lampa.Template.add('lampac_prestige_full', `
      <div class="online-prestige selector">
        <div class="online-prestige__body">
          <div class="online-prestige__title">{title}</div>
          <div class="online-prestige__info">
            <span>{info}</span>
            <span class="online-prestige__quality">{quality}</span>
          </div>
        </div>
      </div>
    `);

    Lampa.Template.add('lampac_prestige_folder', `
      <div class="online-prestige selector">
        <div class="online-prestige__folder">
          <svg viewBox="0 0 128 112" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect y="20" width="128" height="92" rx="13" fill="white"></rect>
            <path d="M29.9963 8H98.0037C96.0446 3.3021 91.4079 0 86 0H42C36.5921 0 31.9555 3.3021 29.9963 8Z" fill="white" fill-opacity="0.23"></path>
            <rect x="11" y="8" width="106" height="76" rx="13" fill="white" fill-opacity="0.51"></rect>
          </svg>
        </div>
        <div class="online-prestige__body">
          <div class="online-prestige__title">{title}</div>
          <div class="online-prestige__info">{info}</div>
        </div>
      </div>
    `);

    Lampa.Template.add('lampac_content_loading', `
      <div class="broadcast__scan"><div></div></div>
      <div style="padding:2em;text-align:center;color:rgba(255,255,255,0.5)">
        <div style="margin-bottom:1em">⏳ Загрузка источников...</div>
      </div>
    `);

    Lampa.Template.add('lampac_does_not_answer', `
      <div style="padding:2em;text-align:center">
        <div style="font-size:1.5em;margin-bottom:1em">😔 Источники не найдены</div>
        <div style="margin-bottom:2em;color:rgba(255,255,255,0.6)">Балансер {balanser} не вернул результатов</div>
        <div class="selector change" style="background:rgba(255,255,255,0.1);padding:1em 2em;border-radius:0.3em;display:inline-block">Назад</div>
      </div>
    `);

    // Регистрируем компонент
    Lampa.Component.add('online_watch', component);
    console.log('ОНЛАЙН: ✅ Компонент зарегистрирован');

    // Добавляем настройки (если доступен API)
    try {
      if (Lampa.SettingsApi) {
        Lampa.SettingsApi.addComponent({
          component: 'online_plugin_settings',
          name: 'Онлайн Плагин',
          icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="white"/></svg>'
        });

        Lampa.SettingsApi.addParam({
          component: 'online_plugin_settings',
          param: {
            name: 'online_plugin_host',
            type: 'input',
            default: '',
            placeholder: 'http://192.168.1.10:9118'
          },
          field: {
            name: 'Адрес сервера',
            description: 'Укажите полный адрес вашего онлайн сервера'
          }
        });

        Lampa.SettingsApi.addParam({
          component: 'online_plugin_settings',
          param: {
            name: 'online_balanser',
            type: 'select',
            default: 'filmix',
            values: BALANCERS_LIST.map(function(b) { return {value: b, title: b}; })
          },
          field: {
            name: 'Балансер по умолчанию',
            description: 'Выберите предпочитаемый балансер'
          }
        });

        console.log('ОНЛАЙН: ✅ Настройки добавлены');
      }
    } catch(e) {
      console.log('ОНЛАЙН: ⚠️ Настройки недоступны:', e);
    }

    // Синхронизация настроек для разных версий
    if (Lampa.Manifest && Lampa.Manifest.app_digital >= 177) {
      BALANCERS_LIST.forEach(function(name) {
        Lampa.Storage.sync('online_choice_' + name, 'object_object');
      });
      Lampa.Storage.sync('online_watched_last', 'object_object');
    }

    // Добавляем кнопку на страницу фильма
    function addButton(render, movie) {
      if (render.find('.online-plugin-button').length) return;

      var btn = $(`
        <div class="full-start__button selector online-plugin-button view--online">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12,2C6.48,2,2,6.48,2,12s4.48,10,10,10s10-4.48,10-10S17.52,2,12,2z M10,16.5v-9l6,4.5L10,16.5z"/>
          </svg>
          <span>Онлайн</span>
        </div>
      `);

      btn.on('hover:enter', function() {
        Lampa.Activity.push({
          url: '',
          title: 'Онлайн Просмотр',
          component: 'online_watch',
          movie: movie,
          page: 1
        });
      });

      render.after(btn);
      console.log('ОНЛАЙН: ✅ Кнопка добавлена');
    }

    // Слушаем события открытия карточки
    Lampa.Listener.follow('full', function(e) {
      if (e.type === 'complite') {
        var torrent_button = e.object.activity.render().find('.view--torrent');
        if (torrent_button.length) {
          addButton(torrent_button, e.data.movie);
        }
      }
    });

    // Проверяем текущую активность
    try {
      if (Lampa.Activity.active() && Lampa.Activity.active().component === 'full') {
        var torrent_button = Lampa.Activity.active().activity.render().find('.view--torrent');
        if (torrent_button.length) {
          addButton(torrent_button, Lampa.Activity.active().card);
        }
      }
    } catch(e) {
      console.log('ОНЛАЙН: Не удалось добавить кнопку в текущую активность');
    }

    console.log('ОНЛАЙН: ✅ Плагин полностью загружен');
  }

  // Запуск плагина
  if (window.Lampa) {
    startPlugin();
  } else {
    console.log('ОНЛАЙН: Ожидание загрузки Lampa...');
    document.addEventListener('DOMContentLoaded', function() {
      setTimeout(startPlugin, 1000);
    });
  }

})();
