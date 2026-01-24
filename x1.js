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

  function getAndroidVersion() {
    if (Lampa.Platform.is('android')) {
      try {
        var current = AndroidJS.appVersion().split('-');
        return parseInt(current.pop());
      } catch (e) { return 0; }
    }
    return 0;
  }

  var hostkey = 'z01.online';

  if (!window.rch_nws) window.rch_nws = {};
  window.rch_nws[hostkey] = {
    type: Lampa.Platform.is('android') ? 'apk' : 'web',
    startTypeInvoke: false,
    rchRegistry: false,
    apkVersion: getAndroidVersion()
  };

  window.rch_nws[hostkey].typeInvoke = function(host, call) {
    if (!this.startTypeInvoke) {
      this.startTypeInvoke = true;
      this.type = Lampa.Platform.is('android') ? 'apk' : 'web';
      call();
    } else call();
  };

  window.rch_nws[hostkey].Registry = function(client, startConnection) {
    var _this = this;
    this.typeInvoke('http://z01.online', function() {
      client.invoke("RchRegistry", JSON.stringify({
        version: 149,
        host: location.host,
        rchtype: _this.type,
        apkVersion: _this.apkVersion,
        player: Lampa.Storage.field('player')
      }));

      if (client._shouldReconnect && _this.rchRegistry) {
        if (startConnection) startConnection();
        return;
      }

      _this.rchRegistry = true;
      client.on('RchRegistry', function() { if (startConnection) startConnection(); });

      client.on("RchClient", function(rchId, url, data, headers, returnHeaders) {
        var network = new Lampa.Reguest();
        function result(html) {
          if (Lampa.Arrays.isObject(html) || Lampa.Arrays.isArray(html)) html = JSON.stringify(html);
          client.invoke("RchResult", rchId, html);
        }

        if (url == 'eval') result(eval(data));
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

  function rchInvoke(json, call) {
    if (window.nwsClient && window.nwsClient[hostkey] && window.nwsClient[hostkey]._shouldReconnect) return call();
    if (!window.nwsClient) window.nwsClient = {};
    if (window.nwsClient[hostkey] && window.nwsClient[hostkey].socket) window.nwsClient[hostkey].socket.close();
    
    window.nwsClient[hostkey] = new NativeWsClient(json.nws, { autoReconnect: false });
    window.nwsClient[hostkey].on('Connected', function() {
      window.rch_nws[hostkey].Registry(window.nwsClient[hostkey], call);
    });
    window.nwsClient[hostkey].connect();
  }

  function rchRun(json, call) {
    if (typeof NativeWsClient == 'undefined') {
      Lampa.Utils.putScript(["http://z01.online/js/nws-client-es5.js?v18112025"], function() {}, false, function() {
        rchInvoke(json, call);
      }, true);
    } else rchInvoke(json, call);
  }

  function account(url) {
    url = url + '';
    var email = Lampa.Storage.get('account_email');
    if (email && url.indexOf('account_email=') == -1) url = Lampa.Utils.addUrlComponent(url, 'account_email=' + encodeURIComponent(email));
    if (url.indexOf('uid=') == -1) url = Lampa.Utils.addUrlComponent(url, 'uid=' + encodeURIComponent(unic_id));
    return url;
  }

  function component(object) {
    var network = new Lampa.Reguest();
    var scroll = new Lampa.Scroll({ mask: true, over: true });
    var files = new Lampa.Explorer(object);
    var filter = new Lampa.Filter(object);
    var sources = {};
    var last, source, balanser, initialized, balanser_timer, filter_sources = [];
    var filter_find = { season: [], voice: [] };

    if (balansers_with_search == undefined) {
      network.silent(account('http://z01.online/lite/withsearch'), function(json) { balansers_with_search = json; }, function() { balansers_with_search = []; });
    }

    this.initialize = function() {
      var _this = this;
      this.loading(true);
      
      filter.onSearch = function(value) {
        Lampa.Activity.replace({ search: value, clarification: true, similar: true });
      };

      filter.onSelect = function(type, a, b) {
        if (type == 'filter') {
          if (a.reset) {
            _this.replaceChoice({ season: 0, voice: 0, voice_url: '', voice_name: '' });
            setTimeout(function() { Lampa.Select.close(); Lampa.Activity.replace({ clarification: 0, similar: 0 }); }, 10);
          } else {
            var url = filter_find[a.stype][b.index].url;
            var choice = _this.getChoice();
            if (a.stype == 'voice') { choice.voice_name = filter_find.voice[b.index].title; choice.voice_url = url; }
            choice[a.stype] = b.index;
            _this.saveChoice(choice);
            _this.reset();
            _this.request(url);
            setTimeout(Lampa.Select.close, 10);
          }
        } else if (type == 'sort') {
          Lampa.Select.close();
          object.lampac_custom_select = a.source;
          _this.changeBalanser(a.source);
        }
      };

      scroll.body().addClass('torrent-list');
      files.appendFiles(scroll.render());
      files.appendHead(filter.render());
      scroll.minus(files.render().find('.explorer__files-head'));
      this.loading(false);

      this.externalids().then(function() {
        return _this.createSource();
      }).then(function() {
        _this.search();
      })["catch"](function(e) { _this.noConnectToServer(e); });
    };

    this.externalids = function() {
      return new Promise(function(resolve) {
        if (!object.movie.imdb_id || !object.movie.kinopoisk_id) {
          var url = Defined.localhost + 'externalids?id=' + object.movie.id + '&serial=' + (object.movie.name ? 1 : 0);
          network.silent(account(url), function(json) {
            for (var name in json) object.movie[name] = json[name];
            resolve();
          }, resolve);
        } else resolve();
      });
    };

    this.changeBalanser = function(name) {
      var last_select = Lampa.Storage.cache('online_last_balanser', 3000, {});
      last_select[object.movie.id] = name;
      Lampa.Storage.set('online_last_balanser', last_select);
      Lampa.Storage.set('online_balanser', name);
      Lampa.Activity.replace();
    };

    this.requestParams = function(url) {
      var query = [
        'id=' + object.movie.id,
        'imdb_id=' + (object.movie.imdb_id || ''),
        'kinopoisk_id=' + (object.movie.kinopoisk_id || ''),
        'title=' + encodeURIComponent(object.movie.title || object.movie.name),
        'serial=' + (object.movie.name ? 1 : 0),
        'year=' + ((object.movie.release_date || object.movie.first_air_date || '0000') + '').slice(0, 4)
      ];
      return url + (url.indexOf('?') >= 0 ? '&' : '?') + query.join('&');
    };

    this.createSource = function() {
      var _this = this;
      return new Promise(function(resolve, reject) {
        network.silent(account(_this.requestParams(Defined.localhost + 'lite/events?life=true')), function(json) {
          if (json.online) {
            sources = {};
            json.online.forEach(function(j) {
              var n = (j.balanser || j.name.split(' ')[0]).toLowerCase();
              sources[n] = { url: j.url, name: j.name.replace('2160','720'), show: j.show !== false };
            });
            filter_sources = Object.keys(sources);
            balanser = Lampa.Storage.get('online_balanser', filter_sources[0]);
            if (!sources[balanser]) balanser = filter_sources[0];
            source = sources[balanser].url;
            resolve();
          } else reject(json);
        }, reject);
      });
    };

    this.search = function() {
      this.filter({ source: filter_sources }, this.getChoice());
      this.find();
    };

    this.find = function() { this.request(this.requestParams(source)); };

    this.request = function(url) {
      network["native"](account(url), this.parse.bind(this), this.doesNotAnswer.bind(this), false, { dataType: 'text' });
    };

    this.parse = function(str) {
      var json = Lampa.Arrays.decodeJson(str, {});
      if (json.rch) return rchRun(json, this.find.bind(this));
      
      try {
        var items = this.parseJsonDate(str, '.videos__item');
        if (items.length) {
          this.activity.loader(false);
          var videos = items.filter(function(v) { return v.method == 'play' || v.method == 'call'; });
          if (videos.length) this.display(videos);
          else if (items[0].method == 'link') {
            filter_find.season = items.map(function(s) { return { title: s.text, url: s.url }; });
            this.request(items[0].url);
          } else this.empty();
        } else this.empty();
      } catch (e) { this.doesNotAnswer(e); }
    };

    this.parseJsonDate = function(str, name) {
      var html = $('<div>' + str + '</div>');
      var elems = [];
      html.find(name).each(function() {
        var item = $(this);
        var data = JSON.parse(item.attr('data-json') || '{}');
        data.text = item.text();
        data.season = item.attr('s');
        data.episode = item.attr('e');
        elems.push(data);
      });
      return elems;
    };

    this.display = function(videos) {
      var _this = this;
      this.draw(videos, {
        onEnter: function(item) {
          Lampa.Loading.start(function() { Lampa.Loading.stop(); network.clear(); });
          network["native"](account(item.url), function(json) {
            Lampa.Loading.stop();
            if (json.url) {
              var play_data = { title: item.text || object.movie.title, url: json.url, quality: json.quality || item.quality };
              Lampa.Player.play(play_data);
              Lampa.Player.playlist([play_data]);
              item.mark && item.mark();
            } else Lampa.Noty.show(Lampa.Lang.translate('lampac_nolink'));
          }, function() { Lampa.Loading.stop(); Lampa.Noty.show(Lampa.Lang.translate('lampac_nolink')); });
        }
      });
    };

    this.draw = function(items, params) {
      var _this = this;
      scroll.clear();
      items.forEach(function(element) {
        var html = Lampa.Template.get('lampac_prestige_full', { title: element.text || 'Файл', info: element.quality || '', quality: '', time: '' });
        html.on('hover:enter', function() { params.onEnter(element); })
            .on('hover:focus', function(e) { last = e.target; scroll.update($(e.target), true); });
        scroll.append(html);
      });
      Lampa.Controller.enable('content');
    };

    this.empty = function() {
      var _this = this;
      this.activity.loader(false);
      var html = Lampa.Template.get('lampac_does_not_answer', { balanser: balanser });
      html.find('.online-empty__title').text(Lampa.Lang.translate('empty_title_two'));
      html.find('.online-empty__time').text(Lampa.Lang.translate('empty_text'));
      
      // Добавляем обработчик на кнопку смены источника на случай "Пусто"
      html.find('.change').on('hover:enter', function() {
        filter.render().find('.filter--sort').trigger('hover:enter');
      });
      
      scroll.clear();
      scroll.append(html);
    };

    this.doesNotAnswer = function() {
      var _this = this;
      this.activity.loader(false);
      var html = Lampa.Template.get('lampac_does_not_answer', { balanser: balanser });
      html.find('.change').on('hover:enter', function() {
        filter.render().find('.filter--sort').trigger('hover:enter');
      });
      scroll.clear();
      scroll.append(html);
    };

    this.getChoice = function() { return Lampa.Storage.cache('online_choice_' + balanser, 3000, {})[object.movie.id] || { season: 0, voice: 0 }; };
    this.saveChoice = function(choice) {
      var data = Lampa.Storage.cache('online_choice_' + balanser, 3000, {});
      data[object.movie.id] = choice;
      Lampa.Storage.set('online_choice_' + balanser, data);
    };
    this.replaceChoice = function(choice) {
      var to = this.getChoice();
      Lampa.Arrays.extend(to, choice, true);
      this.saveChoice(to);
    };

    this.loading = function(status) { this.activity.loader(status); if (!status) this.activity.toggle(); };
    
    this.filter = function(filter_items) {
      var select = [{ title: Lampa.Lang.translate('torrent_parser_reset'), reset: true }];
      filter.set('filter', select);
      filter.set('sort', filter_sources.map(function(e) {
        return { title: sources[e].name, source: e, selected: e == balanser };
      }));
      filter.chosen('sort', [sources[balanser] ? sources[balanser].name : balanser]);
    };

    this.start = function() {
      if (!initialized) { initialized = true; this.initialize(); }
      Lampa.Controller.add('content', {
        toggle: function() { Lampa.Controller.collectionSet(scroll.render(), files.render()); Lampa.Controller.collectionFocus(last || false, scroll.render()); },
        up: function() { if (Navigator.canmove('up')) Navigator.move('up'); else Lampa.Controller.toggle('head'); },
        down: function() { Navigator.move('down'); },
        right: function() { filter.show(Lampa.Lang.translate('title_filter'), 'filter'); },
        left: function() { Lampa.Controller.toggle('menu'); },
        back: function() { Lampa.Activity.backward(); }
      });
      Lampa.Controller.toggle('content');
    };

    this.render = function() { return files.render(); };
    this.destroy = function() { network.clear(); scroll.destroy(); files.destroy(); };
  }

  function startPlugin() {
    window.lampac_z01_plugin = true;
    Lampa.Component.add('lampac_z01', component);
    
    Lampa.Lang.add({
      lampac_watch: { ru: 'Смотреть онлайн' },
      title_online: { ru: 'Онлайн' },
      lampac_nolink: { ru: 'Не удалось получить ссылку' },
      lampac_change_balanser: { ru: 'Изменить источник' },
      lampac_balanser_dont_work: { ru: 'Ничего не найдено на {balanser}' }
    });

    Lampa.Template.add('lampac_prestige_full', '<div class="online-prestige selector"><div class="online-prestige__body"><div class="online-prestige__title">{title}</div><div class="online-prestige__info">{info}</div></div></div>');
    Lampa.Template.add('lampac_does_not_answer', '<div class="online-empty"><div class="online-empty__title">#{lampac_balanser_dont_work}</div><div class="online-empty__buttons"><div class="online-empty__button selector change">#{lampac_change_balanser}</div></div></div>');

    Lampa.Listener.follow('full', function(e) {
      if (e.type == 'complite') {
        var btn = $('<div class="full-start__button selector lampac--button"><span>#{title_online}</span></div>');
        btn.on('hover:enter', function() {
          Lampa.Activity.push({
            component: 'lampac_z01',
            movie: e.data.movie,
            title: 'Онлайн'
          });
        });
        e.object.activity.render().find('.view--torrent').after(btn);
      }
    });
  }

  if (!window.lampac_z01_plugin) startPlugin();
})();
