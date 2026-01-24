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
      } catch (e) {
        return 0;
      }
    } else {
      return 0;
    }
  }

  var hostkey = 'http://z01.online'.replace('http://', '').replace('https://', '');

  if (!window.rch_nws || !window.rch_nws[hostkey]) {
    if (!window.rch_nws) window.rch_nws = {};

    window.rch_nws[hostkey] = {
      type: Lampa.Platform.is('android') ? 'apk' : undefined,
      startTypeInvoke: false,
      rchRegistry: false,
      apkVersion: getAndroidVersion()
    };
  }

  window.rch_nws[hostkey].typeInvoke = function rchtypeInvoke(host, call) {
    if (!window.rch_nws[hostkey].startTypeInvoke) {
      window.rch_nws[hostkey].startTypeInvoke = true;

      var check = function check(good) {
        window.rch_nws[hostkey].type = Lampa.Platform.is('android') ? 'apk' : good ? 'cors' : 'web';
        call();
      };

      if (Lampa.Platform.is('android')) check(true);
      else {
        var net = new Lampa.Reguest();
        net.silent('http://z01.online'.indexOf(location.host) >= 0 ? 'https://github.com/' : host + '/cors/check', function() {
          check(true);
        }, function() {
          check(false);
        }, false, {
          dataType: 'text'
        });
      }
    } else call();
  };

  window.rch_nws[hostkey].Registry = function RchRegistry(client, startConnection) {
    window.rch_nws[hostkey].typeInvoke('http://z01.online', function() {

      client.invoke("RchRegistry", JSON.stringify({
        version: 149,
        host: location.host,
        rchtype: 'apk',
        apkVersion: window.rch_nws[hostkey].apkVersion,
        player: Lampa.Storage.field('player')
      }));

      if (client._shouldReconnect && window.rch_nws[hostkey].rchRegistry) {
        if (startConnection) startConnection();
        return;
      }

      window.rch_nws[hostkey].rchRegistry = true;

      client.on('RchRegistry', function(clientIp) {
        if (startConnection) startConnection();
      });

      client.on("RchClient", function(rchId, url, data, headers, returnHeaders) {
        var network = new Lampa.Reguest();

        function result(html) {
          if (Lampa.Arrays.isObject(html) || Lampa.Arrays.isArray(html)) {
            html = JSON.stringify(html);
          }

          if (typeof CompressionStream !== 'undefined' && html && html.length > 1000) {
            var compressionStream = new CompressionStream('gzip');
            var encoder = new TextEncoder();
            var readable = new ReadableStream({
              start: function(controller) {
                controller.enqueue(encoder.encode(html));
                controller.close();
              }
            });
            var compressedStream = readable.pipeThrough(compressionStream);
            new Response(compressedStream).arrayBuffer()
              .then(function(compressedBuffer) {
                var compressedArray = new Uint8Array(compressedBuffer);
                if (compressedArray.length > html.length) {
                  client.invoke("RchResult", rchId, html);
                } else {
                  $.ajax({
                    url: 'http://z01.online/rch/gzresult?id=' + rchId,
                    type: 'POST',
                    data: compressedArray,
                    async: true,
                    cache: false,
                    contentType: false,
                    processData: false,
                    success: function(j) {},
                    error: function() {
                      client.invoke("RchResult", rchId, html);
                    }
                  });
                }
              })
              .catch(function() {
                client.invoke("RchResult", rchId, html);
              });

          } else {
            client.invoke("RchResult", rchId, html);
          }
        }

        if (url == 'eval') {
          result(eval(data));
        } else if (url == 'ping') {
          result('pong');
        } else {
          network["native"](url, result, function() {
            result('');
          }, data, {
            dataType: 'text',
            timeout: 1000 * 8,
            headers: headers,
            returnHeaders: returnHeaders
          });
        }
      });

      client.on('Connected', function(connectionId) {
        window.rch_nws[hostkey].connectionId = connectionId;
      });
    });
  };
  
  window.rch_nws[hostkey].typeInvoke('http://z01.online', function() {});

  function rchInvoke(json, call) {
    if (window.nwsClient && window.nwsClient[hostkey] && window.nwsClient[hostkey]._shouldReconnect){
      call();
      return;
    }
    if (!window.nwsClient) window.nwsClient = {};
    if (window.nwsClient[hostkey] && window.nwsClient[hostkey].socket)
      window.nwsClient[hostkey].socket.close();
    window.nwsClient[hostkey] = new NativeWsClient(json.nws, {
      autoReconnect: false
    });
    window.nwsClient[hostkey].on('Connected', function(connectionId) {
      window.rch_nws[hostkey].Registry(window.nwsClient[hostkey], function() {
        call();
      });
    });
    window.nwsClient[hostkey].connect();
  }

  function rchRun(json, call) {
    if (typeof NativeWsClient == 'undefined') {
      Lampa.Utils.putScript(["http://z01.online/js/nws-client-es5.js?v18112025"], function() {}, false, function() {
        rchInvoke(json, call);
      }, true);
    } else {
      rchInvoke(json, call);
    }
  }

  function account(url) {
    url = url + '';
    if (url.indexOf('account_email=') == -1) {
      var email = Lampa.Storage.get('account_email');
      if (email) url = Lampa.Utils.addUrlComponent(url, 'account_email=' + encodeURIComponent(email));
    }
    if (url.indexOf('uid=') == -1) {
      var uid = Lampa.Storage.get('lampac_unic_id', '');
      if (uid) url = Lampa.Utils.addUrlComponent(url, 'uid=' + encodeURIComponent(uid));
    }
    return url;
  }
  
  var Network = Lampa.Reguest;

  function component(object) {
    var network = new Network();
    var scroll = new Lampa.Scroll({
      mask: true,
      over: true
    });
    var files = new Lampa.Explorer(object);
    var filter = new Lampa.Filter(object);
    var sources = {};
    var last;
    var source;
    var balanser;
    var initialized;
    var balanser_timer;
    var images = [];
    var number_of_requests = 0;
    var number_of_requests_timer;
    var life_wait_times = 0;
    var life_wait_timer;
    var filter_sources = {};
    var filter_translate = {
      season: Lampa.Lang.translate('torrent_serial_season'),
      voice: Lampa.Lang.translate('torrent_parser_voice'),
      source: Lampa.Lang.translate('settings_rest_source')
    };
    var filter_find = {
      season: [],
      voice: []
    };
    
    if (balansers_with_search == undefined) {
      network.timeout(5000);
      network.silent(account('http://z01.online/lite/withsearch'), function(json) {
        balansers_with_search = json;
      }, function() {
        balansers_with_search = [];
      });
    }
    
    function balanserName(j) {
      var bals = j.balanser;
      var name = j.name.split(' ')[0];
      return (bals || name).toLowerCase();
    }
    
    function clarificationSearchAdd(value){
      var id = Lampa.Utils.hash(object.movie.number_of_seasons ? object.movie.original_name : object.movie.original_title);
      var all = Lampa.Storage.get('clarification_search','{}');
      all[id] = value;
      Lampa.Storage.set('clarification_search',all);
    }
    
    function clarificationSearchDelete(){
      var id = Lampa.Utils.hash(object.movie.number_of_seasons ? object.movie.original_name : object.movie.original_title);
      var all = Lampa.Storage.get('clarification_search','{}');
      delete all[id];
      Lampa.Storage.set('clarification_search',all);
    }
    
    this.initialize = function() {
      var _this = this;
      this.loading(true);
      filter.onSearch = function(value) {
        clarificationSearchAdd(value);
        Lampa.Activity.replace({
          search: value,
          clarification: true,
          similar: true
        });
      };
      filter.onBack = function() {
        _this.start();
      };
      filter.render().find('.selector').on('hover:enter', function() {
        clearInterval(balanser_timer);
      });
      filter.render().find('.filter--search').appendTo(filter.render().find('.torrent-filter'));
      filter.onSelect = function(type, a, b) {
        if (type == 'filter') {
          if (a.reset) {
            clarificationSearchDelete();
            _this.replaceChoice({
              season: 0,
              voice: 0,
              voice_url: '',
              voice_name: ''
            });
            setTimeout(function() {
              Lampa.Select.close();
              Lampa.Activity.replace({
                clarification: 0,
                similar: 0
              });
            }, 10);
          } else {
            var url = filter_find[a.stype][b.index].url;
            var choice = _this.getChoice();
            if (a.stype == 'voice') {
              choice.voice_name = filter_find.voice[b.index].title;
              choice.voice_url = url;
            }
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
      if (filter.addButtonBack) filter.addButtonBack();
      filter.render().find('.filter--sort span').text(Lampa.Lang.translate('lampac_balanser'));
      scroll.body().addClass('torrent-list');
      files.appendFiles(scroll.render());
      files.appendHead(filter.render());
      scroll.minus(files.render().find('.explorer__files-head'));
      
      this.reset(); // Вызываем reset чтобы показать загрузку и кнопку смены источника

      Lampa.Controller.enable('content');
      this.loading(false);
      
      if(object.balanser){
        files.render().find('.filter--search').remove();
        sources = {};
        sources[object.balanser] = {name: object.balanser};
        balanser = object.balanser;
        filter_sources = [];
        
        return network["native"](account(object.url.replace('rjson=','nojson=')), this.parse.bind(this), function(){
          files.render().find('.torrent-filter').remove();
          _this.empty();
        }, false, {
          dataType: 'text'
        });
      } 
      
      this.externalids().then(function() {
        return _this.createSource();
      }).then(function(json) {
        if (!balansers_with_search.find(function(b) {
            return balanser.slice(0, b.length) == b;
          })) {
          filter.render().find('.filter--search').addClass('hide');
        }
        _this.search();
        _this.find();
      })["catch"](function(e) {
        _this.noConnectToServer(e);
      });
    };
    
    this.rch = function(json, noreset) {
      var _this2 = this;
      rchRun(json, function() {
        if (!noreset) _this2.find();
        else noreset();
      });
    };
    
    this.externalids = function() {
      return Promise.resolve();
    };
    
    this.updateBalanser = function(balanser_name) {
      var last_select_balanser = Lampa.Storage.cache('online_last_balanser', 3000, {});
      last_select_balanser[object.movie.id] = balanser_name;
      Lampa.Storage.set('online_last_balanser', last_select_balanser);
    };
    
    this.changeBalanser = function(balanser_name) {
      this.updateBalanser(balanser_name);
      Lampa.Storage.set('online_balanser', balanser_name);
      var to = this.getChoice(balanser_name);
      var from = this.getChoice();
      if (from.voice_name) to.voice_name = from.voice_name;
      this.saveChoice(to, balanser_name);
      Lampa.Activity.replace();
    };
    
    this.requestParams = function(url) {
      var query = [];
      var card_source = object.movie.source || 'tmdb'; 
      query.push('id=' + encodeURIComponent(object.movie.id));
      if (object.movie.imdb_id) query.push('imdb_id=' + (object.movie.imdb_id || ''));
      if (object.movie.kinopoisk_id) query.push('kinopoisk_id=' + (object.movie.kinopoisk_id || ''));
      query.push('title=' + encodeURIComponent(object.clarification ? object.search : object.movie.title || object.movie.name));
      query.push('original_title=' + encodeURIComponent(object.movie.original_title || object.movie.original_name));
      query.push('serial=' + (object.movie.name ? 1 : 0));
      query.push('original_language=' + (object.movie.original_language || ''));
      query.push('year=' + ((object.movie.release_date || object.movie.first_air_date || '0000') + '').slice(0, 4));
      query.push('source=' + card_source);
      query.push('rchtype=apk');
      query.push('clarification=' + (object.clarification ? 1 : 0));
      query.push('similar=' + (object.similar ? true : false));
      if (Lampa.Storage.get('account_email', '')) query.push('cub_id=' + Lampa.Utils.hash(Lampa.Storage.get('account_email', '')));
      return url + (url.indexOf('?') >= 0 ? '&' : '?') + query.join('&');
    };
    
    this.startSource = function(json) {
      return new Promise(function(resolve, reject) {
        json.forEach(function(j) {
          var name = balanserName(j);
          sources[name] = {
            url: j.url,
            name: j.name,
            show: typeof j.show == 'undefined' ? true : j.show
          };
        });
        
        filter_sources = Lampa.Arrays.getKeys(sources);
        if (filter_sources.length) {
          var last_select_balanser = Lampa.Storage.cache('online_last_balanser', 3000, {});
          if (last_select_balanser[object.movie.id]) {
            balanser = last_select_balanser[object.movie.id];
          } else {
            balanser = Lampa.Storage.get('online_balanser', filter_sources[0]);
          }
          if (!sources[balanser]) balanser = filter_sources[0];
          source = sources[balanser].url;
          Lampa.Storage.set('active_balanser', balanser);
          resolve(json);
        } else {
          reject();
        }
      });
    };
    
    this.createSource = function() {
      var _this4 = this;
      return new Promise(function(resolve, reject) {
        var url = _this4.requestParams(Defined.localhost + 'lite/events?life=true');
        network.timeout(8000);
        
        network.silent(account(url), function(json) {
          if (json.accsdb) return reject(json);
          _this4.startSource(json.online || []).then(resolve)["catch"](reject);
        }, reject);
      });
    };
    
    this.find = function() {
      this.request(this.requestParams(source));
    };
    
    this.request = function(url) {
      number_of_requests++;
      if (number_of_requests < 10) {
        network["native"](account(url), this.parse.bind(this), this.doesNotAnswer.bind(this), false, {
          dataType: 'text'
        });
      } else this.empty();
    };
    
    this.parseJsonDate = function(str, name) {
      if (!str || typeof str !== 'string') return [];
      var html = $('<div>' + str + '</div>'), elems = [];
      html.find(name).each(function() {
          var item = $(this);
          var json = item.attr('data-json');
          if (json) {
              var data = JSON.parse(json);
              data.text = item.text().trim();
              data.active = item.hasClass('active');
              if (item.attr('s')) data.season = parseInt(item.attr('s'));
              if (item.attr('e')) data.episode = parseInt(item.attr('e'));
              elems.push(data);
          }
      });
      return elems;
    };
    
    this.display = function(videos) {
      var _this5 = this;
      this.draw(videos, {
        onEnter: function onEnter(item, html) {
            _this5.getFileUrl(item, function(json, json_call) {
                if (json && json.url) {
                    var element = _this5.toPlayElement(item);
                    element.url = json.url;
                    element.isonline = true;
                    Lampa.Player.play(element);
                    item.mark();
                } else Lampa.Noty.show(Lampa.Lang.translate('lampac_nolink'));
            });
        }
      });
    };
    
    this.parse = function(str) {
      var json = Lampa.Arrays.decodeJson(str, {});
      if (json.rch) return this.rch(json);
      try {
        var items = this.parseJsonDate(str, '.videos__item');
        if (items.length) {
            this.activity.loader(false);
            this.display(items.filter(v => v.method == 'play' || v.method == 'call'));
        } else {
            this.doesNotAnswer();
        }
      } catch (e) { this.doesNotAnswer(e); }
    };

    this.reset = function() {
      last = false;
      clearInterval(balanser_timer);
      network.clear();
      scroll.clear();
      scroll.reset();
      
      var loading = Lampa.Template.get('lampac_content_loading');
      loading.find('.change').on('hover:enter', function() {
        filter.render().find('.filter--sort').trigger('hover:enter');
      });
      
      scroll.body().append(loading);
      Lampa.Controller.enable('content');
    };
    
    this.loading = function(status) {
      if (status) this.activity.loader(true);
      else {
        this.activity.loader(false);
        this.activity.toggle();
      }
    };
    
    this.filter = function(filter_items, choice) {
      var _this7 = this;
      var select = [];
      filter_items.source = filter_sources;
      select.push({ title: Lampa.Lang.translate('torrent_parser_reset'), reset: true });
      filter.set('filter', select);
      filter.set('sort', filter_sources.map(function(e) {
        return {
          title: sources[e] ? sources[e].name : e,
          source: e,
          selected: e == balanser
        };
      }));
    };
    
    this.getChoice = function() { return Lampa.Storage.cache('online_choice_' + balanser, 3000, {}); };
    this.saveChoice = function(c) { Lampa.Storage.set('online_choice_' + balanser, c); };
    this.replaceChoice = function(c) { 
        var to = this.getChoice();
        Lampa.Arrays.extend(to, c, true);
        this.saveChoice(to);
    };

    this.empty = function() {
      var html = Lampa.Template.get('lampac_does_not_answer', {});
      html.find('.online-empty__title').text(Lampa.Lang.translate('empty_title_two'));
      html.find('.online-empty__time').text(Lampa.Lang.translate('empty_text'));
      html.find('.cancel').remove();
      html.find('.change').on('hover:enter', function() {
        filter.render().find('.filter--sort').trigger('hover:enter');
      });
      scroll.clear();
      scroll.append(html);
      Lampa.Controller.enable('content');
    };
    
    this.doesNotAnswer = function() {
      var _this9 = this;
      var html = Lampa.Template.get('lampac_does_not_answer', { balanser: balanser });
      html.find('.cancel').on('hover:enter', function() { clearInterval(balanser_timer); });
      html.find('.change').on('hover:enter', function() {
        clearInterval(balanser_timer);
        filter.render().find('.filter--sort').trigger('hover:enter');
      });
      scroll.clear();
      scroll.append(html);
      Lampa.Controller.enable('content');
    };
    
    this.start = function() {
      if (Lampa.Activity.active().activity !== this.activity) return;
      if (!initialized) {
        initialized = true;
        this.initialize();
      }
      Lampa.Controller.add('content', {
        toggle: function toggle() {
          Lampa.Controller.collectionSet(scroll.render(), files.render());
          Lampa.Controller.collectionFocus(last || false, scroll.render());
        },
        right: function right() { filter.show(Lampa.Lang.translate('title_filter'), 'filter'); },
        up: function up() { Lampa.Controller.toggle('head'); },
        back: function() { Lampa.Activity.backward(); }
      });
      Lampa.Controller.toggle('content');
    };
    
    this.render = function() { return files.render(); };
    this.destroy = function() { network.clear(); scroll.destroy(); clearInterval(balanser_timer); };
  }

  function startPlugin() {
    window.lampac_z01_plugin = true;
    Lampa.Component.add('lampac_z01', component);
    
    Lampa.Lang.add({
      ru: {
        lampac_watch: 'Смотреть онлайн',
        lampac_balanser: 'Источник',
        title_online: 'Онлайн',
        lampac_change_balanser: 'Изменить источник',
        lampac_balanser_dont_work: 'Ничего не найдено на ({balanser})',
        lampac_balanser_timeout: 'Автопереключение через <span class="timeout">5</span> сек.'
      }
    });

    Lampa.Template.add('lampac_css', `<style>
        .online-prestige{position:relative;border-radius:.3em;background-color:rgba(0,0,0,0.3);display:flex;margin-bottom:10px;padding:10px}
        .online-prestige.focus{background:#fff;color:#000}
        .online-empty{padding:20px;text-align:center}
        .online-empty__button{background:rgba(255,255,255,0.1);padding:10px 20px;border-radius:4px;display:inline-block;margin-top:20px}
        .online-empty__button.focus{background:#fff;color:#000}
    </style>`);
    $('body').append(Lampa.Template.get('lampac_css', {}, true));

    Lampa.Template.add('lampac_prestige_full', `<div class="online-prestige selector"><div class="online-prestige__title">{text}</div></div>`);
    
    // ОБНОВЛЕННЫЙ ШАБЛОН ЗАГРУЗКИ С КНОПКОЙ
    Lampa.Template.add('lampac_content_loading', `
        <div class="online-empty">
            <div class="broadcast__scan"><div></div></div>
            <div class="online-empty__buttons">
                <div class="online-empty__button selector change">#{lampac_change_balanser}</div>
            </div>
        </div>`);

    Lampa.Template.add('lampac_does_not_answer', `<div class="online-empty">
        <div class="online-empty__title">#{lampac_balanser_dont_work}</div>
        <div class="online-empty__time">#{lampac_balanser_timeout}</div>
        <div class="online-empty__buttons">
            <div class="online-empty__button selector cancel">#{cancel}</div>
            <div class="online-empty__button selector change">#{lampac_change_balanser}</div>
        </div>
    </div>`);

    var button = `<div class="full-start__button selector view--online lampac--button">
      <svg width="128" height="128" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="10" y="10" width="108" height="108" rx="0" fill="none" stroke="currentColor" stroke-width="10"/>
        <path d="M50 40L85 64L50 88V40Z" fill="currentColor"/>
      </svg>
      <span>#{title_online}</span>
    </div>`;

    Lampa.Listener.follow('full', function(e) {
      if (e.type == 'complite') {
        var btn = $(Lampa.Lang.translate(button));
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
  }

  if (!window.lampac_z01_plugin) startPlugin();
})();
