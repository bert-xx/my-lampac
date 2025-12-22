(function() {
  'use strict';

  var Defined = {
    api: 'lampac',
    
    localhost: 'https://valuable333.koyeb.app/', 
    apn: ''
  };

  var unic_id = Lampa.Storage.get('lampac_unic_id', Lampa.Utils.uid(8));

  
  function account(url) {
    url = url + '';
    if (url.indexOf('uid=') == -1) {
      url = Lampa.Utils.addUrlComponent(url, 'uid=' + encodeURIComponent(unic_id));
    }
    return url;
  }

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
      
      
      var url = this.requestParams(Defined.localhost + 'lite/events');
      network.silent(account(url), function(json) {
        if (json.online) {
          json.online.forEach(function(j) {
            var name = (j.balanser || j.name.split(' ')[0]).toLowerCase();
            sources[name] = { url: j.url, name: j.name };
          });
          filter_sources = Object.keys(sources);
          balanser = Lampa.Storage.get('online_balanser', filter_sources[0]);
          if(!sources[balanser]) balanser = filter_sources[0];
          _this.find();
        } else { _this.empty(); }
      }, function() { _this.empty(); });
    };

    this.requestParams = function(url) {
      var query = [];
      query.push('id=' + encodeURIComponent(object.movie.id));
      query.push('title=' + encodeURIComponent(object.movie.title || object.movie.name));
      query.push('serial=' + (object.movie.name ? 1 : 0));
      query.push('year=' + ((object.movie.release_date || object.movie.first_air_date || '0000') + '').slice(0, 4));
      return url + (url.indexOf('?') >= 0 ? '&' : '?') + query.join('&');
    };

    this.find = function() {
      this.request(this.requestParams(sources[balanser].url));
    };

    this.request = function(url) {
      var _this = this;
      network.native(account(url), function(str) {
        _this.parse(str);
      }, function() { _this.empty(); }, false, { dataType: 'text' });
    };

    this.parse = function(str) {
      this.loading(false);
      try {
        var html = $('<div>' + str + '</div>');
        var items = [];
        html.find('.videos__item').each(function() {
          var data = JSON.parse($(this).attr('data-json'));
          data.text = $(this).text();
          items.push(data);
        });
        if (items.length) this.display(items);
        else this.empty();
      } catch (e) { this.empty(); }
    };

    this.display = function(items) {
      var _this = this;
      scroll.clear();
      items.forEach(function(element) {
        var html = Lampa.Template.get('button', { title: element.text, description: element.quality || '' });
        html.on('hover:enter', function() {
          if (element.method == 'play' || element.url) {
            Lampa.Player.play({ url: element.url, title: element.text, movie: object.movie });
            _this.mark(element);
          }
        });
        scroll.append(html);
      });
      Lampa.Controller.enable('content');
    };

    this.mark = function(elem) { /* Логика отметки просмотра */ };
    this.empty = function() { this.loading(false); scroll.clear(); scroll.append($('<div class="empty">На вашем сервере Lampac ничего не найдено</div>')); };
    this.loading = function(status) { this.activity.loader(status); if(!status) this.activity.toggle(); };
    this.render = function() { return files.render(); };
    this.destroy = function() { network.clear(); scroll.destroy(); };
  }

  function startPlugin() {
    window.vod_plugin = true;
    Lampa.Component.add('vod', component);
    Lampa.Manifest.plugins = { type: 'video', name: 'My Private Online', version: '1.0.0' };

    Lampa.Listener.follow('full', function(e) {
      if (e.type == 'complite') {
        var btn = $('<div class="full-start__button selector view--online"><span>Смотреть на моем сервере</span></div>');
        btn.on('hover:enter', function() {
          Lampa.Activity.push({ component: 'vod', movie: e.data.movie, title: 'Мой онлайн' });
        });
        e.render.after(btn);
      }
    });
  }

  if (!window.vod_plugin) startPlugin();
})();
