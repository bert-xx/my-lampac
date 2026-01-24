(function() {
  'use strict';

  var Defined = {
    api: 'lampac',
    localhost: 'http://z01.online/',
    apn: ''
  };

  var balansers_with_search;
  var unic_id = Lampa.Storage.get('lampac_unic_id', '');
  if (!unic_id) {
    unic_id = Lampa.Utils.uid(8).toLowerCase();
    Lampa.Storage.set('lampac_unic_id', unic_id);
  }

  var hostkey = 'http://z01.online'.replace('http://', '').replace('https://', '');

  if (!window.rch_nws || !window.rch_nws[hostkey]) {
    if (!window.rch_nws) window.rch_nws = {};
    window.rch_nws[hostkey] = {
      type: 'apk',
      startTypeInvoke: false,
      rchRegistry: false,
      apkVersion: 0
    };
  }

  // Основная функция запросов
  function rchInvoke(json, call) {
    if (window.nwsClient && window.nwsClient[hostkey] && window.nwsClient[hostkey]._shouldReconnect) {
      call();
      return;
    }
    if (!window.nwsClient) window.nwsClient = {};
    if (window.nwsClient[hostkey] && window.nwsClient[hostkey].socket) window.nwsClient[hostkey].socket.close();
    
    window.nwsClient[hostkey] = new NativeWsClient(json.nws, { autoReconnect: false });
    window.nwsClient[hostkey].on('Connected', function() {
      clientRegistry(window.nwsClient[hostkey], call);
    });
    window.nwsClient[hostkey].connect();
  }

  function clientRegistry(client, call) {
    client.invoke("RchRegistry", JSON.stringify({
      version: 149,
      host: location.host,
      rchtype: 'apk',
      player: Lampa.Storage.field('player')
    }));
    client.on("RchClient", function(rchId, url, data, headers, returnHeaders) {
      var network = new Lampa.Reguest();
      var result = function(html) {
        if (Lampa.Arrays.isObject(html) || Lampa.Arrays.isArray(html)) html = JSON.stringify(html);
        client.invoke("RchResult", rchId, html);
      };
      network["native"](url, result, function() { result(''); }, data, { dataType: 'text', timeout: 8000, headers: headers, returnHeaders: returnHeaders });
    });
    call();
  }

  function rchRun(json, call) {
    if (typeof NativeWsClient == 'undefined') {
      Lampa.Utils.putScript(["http://z01.online/js/nws-client-es5.js?v18112025"], function() {}, false, function() {
        rchInvoke(json, call);
      }, true);
    } else rchInvoke(json, call);
  }

  function account(url) {
    var email = Lampa.Storage.get('account_email');
    var uid = Lampa.Storage.get('lampac_unic_id');
    if (email) url = Lampa.Utils.addUrlComponent(url, 'account_email=' + encodeURIComponent(email));
    if (uid) url = Lampa.Utils.addUrlComponent(url, 'uid=' + encodeURIComponent(uid));
    return url;
  }

  function component(object) {
    var network = new Lampa.Reguest();
    var scroll = new Lampa.Scroll({ mask: true, over: true });
    var files = new Lampa.Explorer(object);
    var filter = new Lampa.Filter(object);
    var sources = {};
    var source, balanser, balanser_timer, initialized;
    var filter_sources = [];
    var filter_find = { season: [], voice: [] };

    this.initialize = function() {
      var _this = this;
      this.loading(true);
      
      filter.onSearch = function(value) {
        Lampa.Activity.replace({ search: value, clarification: true, similar: true });
      };
      
      filter.onSelect = function(type, a, b) {
        if (type == 'filter') {
          if (a.reset) {
            _this.replaceChoice({ season: 0, voice: 0 });
            Lampa.Activity.replace({ clarification: 0, similar: 0 });
          } else {
            var url = filter_find[a.stype][b.index].url;
            var choice = _this.getChoice();
            choice[a.stype] = b.index;
            _this.saveChoice(choice);
            _this.reset();
            _this.request(url);
          }
        } else if (type == 'sort') {
          _this.changeBalanser(a.source);
        }
        Lampa.Select.close();
      };

      scroll.body().addClass('torrent-list');
      files.appendFiles(scroll.render());
      files.appendHead(filter.render());
      this.loading(false);

      this.createSource().then(function() {
        _this.find();
      }).catch(function() {
        _this.empty();
      });
    };

    this.requestParams = function(url) {
      var query = [
        'id=' + object.movie.id,
        'title=' + encodeURIComponent(object.search || object.movie.title || object.movie.name),
        'serial=' + (object.movie.name ? 1 : 0),
        'rchtype=apk'
      ];
      return url + (url.indexOf('?') >= 0 ? '&' : '?') + query.join('&');
    };

    this.createSource = function() {
      var _this = this;
      return new Promise(function(resolve, reject) {
        var url = _this.requestParams(Defined.localhost + 'lite/events?life=true');
        network.silent(account(url), function(json) {
          json.forEach(function(j) {
            var name = (j.balanser || j.name.split(' ')[0]).toLowerCase();
            sources[name] = { url: j.url, name: j.name };
          });
          filter_sources = Lampa.Arrays.getKeys(sources);
          balanser = Lampa.Storage.get('online_balanser', filter_sources[0]);
          if (!sources[balanser]) balanser = filter_sources[0];
          source = sources[balanser].url;
          resolve();
        }, reject);
      });
    };

    this.find = function() { this.request(this.requestParams(source)); };

    this.request = function(url) {
      network["native"](account(url), this.parse.bind(this), this.doesNotAnswer.bind(this), false, { dataType: 'text' });
    };

    this.parse = function(str) {
      var json = Lampa.Arrays.decodeJson(str, {});
      if (json.rch) return rchRun(json, this.find.bind(this));
      
      var items = this.parseJsonDate(str, '.videos__item');
      if (items.length) {
        this.draw(items);
      } else {
        this.doesNotAnswer();
      }
    };

    this.parseJsonDate = function(str, name) {
      var html = $('<div>' + str + '</div>'), elems = [];
      html.find(name).each(function() {
        var item = $(this), data = JSON.parse(item.attr('data-json') || '{}');
        data.text = item.text();
        elems.push(data);
      });
      return elems;
    };

    this.draw = function(items) {
      var _this = this;
      scroll.clear();
      items.forEach(function(element) {
        var html = Lampa.Template.get('lampac_prestige_full', element);
        html.on('hover:enter', function() {
          // Логика запуска плеера
          if (element.url) Lampa.Player.play({ title: element.text, url: element.url });
        });
        scroll.append(html);
      });
      this.filterData();
      Lampa.Controller.enable('content');
    };

    this.filterData = function() {
      filter.set('sort', filter_sources.map(function(e) {
        return { title: sources[e].name, source: e, selected: e == balanser };
      }));
      filter.chosen('sort', [sources[balanser].name]);
    };

    this.changeBalanser = function(name) {
      Lampa.Storage.set('online_balanser', name);
      Lampa.Activity.replace();
    };

    this.reset = function() {
      scroll.clear();
      scroll.body().append(Lampa.Template.get('lampac_content_loading'));
    };

    this.loading = function(status) {
      this.activity.loader(status);
    };

    this.empty = function() {
      var html = Lampa.Template.get('lampac_does_not_answer', { balanser: balanser });
      html.find('.online-empty__title').text('Ничего не найдено');
      html.find('.online-empty__time').text('Попробуйте сменить источник');
      
      // Кнопка смены источника всегда доступна
      html.find('.change').on('hover:enter', function() {
        filter.render().find('.filter--sort').trigger('hover:enter');
      });

      scroll.clear();
      scroll.append(html);
      this.filterData(); // Обновляем фильтр, чтобы кнопка "Источник" работала
      this.loading(false);
    };

    this.doesNotAnswer = function() {
      this.empty();
    };

    this.getChoice = function() { return Lampa.Storage.cache('online_choice_' + balanser, 3000, {}); };
    this.saveChoice = function(c) { Lampa.Storage.set('online_choice_' + balanser, c); };
    this.replaceChoice = function(c) { 
        var to = this.getChoice();
        Lampa.Arrays.extend(to, c, true);
        this.saveChoice(to);
    };

    this.start = function() {
      if (!initialized) { initialized = true; this.initialize(); }
      Lampa.Controller.add('content', {
        toggle: function() { Lampa.Controller.collectionSet(scroll.render(), files.render()); },
        right: function() { filter.show('Фильтр', 'filter'); },
        up: function() { Lampa.Controller.toggle('head'); },
        back: function() { Lampa.Activity.backward(); }
      });
      Lampa.Controller.toggle('content');
    };

    this.render = function() { return files.render(); };
    this.destroy = function() { network.clear(); scroll.destroy(); };
  }

  // Настройка плагина
  function startPlugin() {
    Lampa.Component.add('lampac_z01', component);
    
    Lampa.Lang.add({
      ru: {
        lampac_watch: 'Смотреть онлайн',
        lampac_video: 'Видео',
        lampac_balanser: 'Источник',
        title_online: 'Онлайн',
        lampac_change_balanser: 'Изменить источник'
      }
    });

    // Шаблон кнопки (Квадратная)
    var button_html = `
        <div class="full-start__button selector view--online lampac--button">
            <svg width="128" height="128" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="10" y="10" width="108" height="108" fill="white" stroke="#2886fb" stroke-width="10"/>
                <text x="50%" y="55%" text-anchor="middle" dominant-baseline="central" font-family="Arial" font-size="70" font-weight="bold" fill="#2886fb">Z</text>
            </svg>
            <span>Онлайн</span>
        </div>`;

    Lampa.Listener.follow('full', function(e) {
      if (e.type == 'complite') {
        var btn = $(button_html);
        btn.on('hover:enter', function() {
          Lampa.Activity.push({
            title: 'Онлайн',
            component: 'lampac_z01',
            movie: e.data.movie,
            search: e.data.movie.title
          });
        });
        e.object.activity.render().find('.view--torrent').after(btn);
      }
    });

    // Стили
    Lampa.Template.add('lampac_css', `
        <style>
            .online-prestige{background:rgba(255,255,255,0.05); margin-bottom:10px; padding:10px; display:flex; border-radius:4px;}
            .online-prestige.focus{background:#fff; color:#000;}
            .online-empty{padding:20px; text-align:center;}
            .online-empty__button{padding:10px 20px; background:rgba(255,255,255,0.1); display:inline-block; margin:10px; border-radius:4px;}
            .online-empty__button.focus{background:#fff; color:#000;}
        </style>
    `);
    $('body').append(Lampa.Template.get('lampac_css', {}, true));

    // Шаблоны карточек
    Lampa.Template.add('lampac_prestige_full', '<div class="online-prestige selector"><div class="online-prestige__title">{text}</div></div>');
    Lampa.Template.add('lampac_content_loading', '<div class="online-empty">Загрузка...</div>');
    Lampa.Template.add('lampac_does_not_answer', `
        <div class="online-empty">
            <div class="online-empty__title">Ничего не найдено</div>
            <div class="online-empty__time">Попробуйте другой источник</div>
            <div class="online-empty__buttons">
                <div class="online-empty__button selector change">Изменить источник</div>
            </div>
        </div>`);
  }

  if (!window.lampac_z01_plugin) {
    window.lampac_z01_plugin = true;
    startPlugin();
  }
})();
