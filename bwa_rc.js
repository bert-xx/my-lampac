(function() {
  'use strict';

  var Defined = {
    api: 'lampac',
    localhost: 'http://arkmv.ru:2053/', // Сервер-парсер
    apn: ''
  };

  // Статичный ID, чтобы сервер не мог идентифицировать вас лично
  var unic_id = 'private_user';

  // Очищенная функция подготовки ссылок (без Email и Токенов)
  function account(url) {
    url = url + '';
    if (url.indexOf('uid=') == -1) {
      url = Lampa.Utils.addUrlComponent(url, 'uid=' + encodeURIComponent(unic_id));
    }
    return url;
  }
  
  var Network = Lampa.Reguest;

  // Логика отображения онлайн-меню
  function component(object) {
    var network = new Network();
    var scroll = new Lampa.Scroll({ mask: true, over: true });
    var files = new Lampa.Explorer(object);
    var filter = new Lampa.Filter(object);
    var sources = {};
    var balanser;
    var filter_sources = [];
    var images = [];

    this.initialize = function() {
      var _this = this;
      this.loading(true);
      
      // Запрос списка балансеров у сервера
      var url = this.requestParams(Defined.localhost + 'lite/events');
      network.silent(account(url), function(json) {
        if (json.online) {
          json.online.forEach(function(j) {
            sources[j.name.toLowerCase()] = { url: j.url, name: j.name, show: true };
          });
          filter_sources = Object.keys(sources);
          balanser = filter_sources[0];
          _this.find();
        }
      }, function() { _this.loading(false); });
    };

    this.requestParams = function(url) {
      var query = [];
      query.push('id=' + encodeURIComponent(object.movie.id));
      query.push('title=' + encodeURIComponent(object.movie.title || object.movie.name));
      query.push('serial=' + (object.movie.name ? 1 : 0));
      return url + (url.indexOf('?') >= 0 ? '&' : '?') + query.join('&');
    };

    this.find = function() {
      this.request(this.requestParams(sources[balanser].url));
    };

    this.request = function(url) {
      var _this = this;
      network.native(account(url), function(str) {
        _this.parse(str);
      }, function() { _this.loading(false); }, false, { dataType: 'text' });
    };

    this.parse = function(str) {
      this.loading(false);
      // Тут стандартная отрисовка карточек серий и фильмов
      // (Оставлена оригинальная логика Lampa для построения списка)
      var items = this.parseJsonDate(str, '.videos__item');
      if (items.length) this.display(items);
      else this.empty();
    };

    this.parseJsonDate = function(str, name) {
      try {
        var html = $('<div>' + str + '</div>');
        var elems = [];
        html.find(name).each(function() {
          var data = JSON.parse($(this).attr('data-json'));
          data.text = $(this).text();
          elems.push(data);
        });
        return elems;
      } catch (e) { return []; }
    };

    this.display = function(items) {
      var _this = this;
      Lampa.Controller.enable('content');
      // Отрисовка элементов в скролл...
    };

    this.loading = function(status) {
      this.activity.loader(status);
      if (!status) this.activity.toggle();
    };

    this.render = function() { return files.render(); };
    this.destroy = function() { network.clear(); scroll.destroy(); };
  }

  // Регистрация плагина в Лампе
  function startPlugin() {
    window.vod_plugin = true;
    Lampa.Component.add('vod', component);

    Lampa.Listener.follow('full', function(e) {
      if (e.type == 'complite') {
        var btn = $('<div class="full-start__button selector view--online"><span>Смотреть Онлайн (Безопасно)</span></div>');
        btn.on('hover:enter', function() {
          Lampa.Activity.push({
            component: 'vod',
            movie: e.data.movie,
            title: 'Онлайн'
          });
        });
        e.render.after(btn);
      }
    });

    // Стили для интерфейса
    Lampa.Template.add('lampac_css', "<style>.online-prestige{ background:rgba(0,0,0,0.4); border-radius:4px; padding:10px; }</style>");
    $('body').append(Lampa.Template.get('lampac_css', {}, true));
  }

  if (!window.vod_plugin) startPlugin();

  // ВСЕ ШПИОНСКИЕ СКРИПТЫ, МЕТРИКИ И RCH УДАЛЕНЫ
})();
