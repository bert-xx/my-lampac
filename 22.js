(function() {
  'use strict';

  console.log('=== ОНЛАЙН ПЛАГИН: Загрузка ===');

  // Список балансеров
  var balancers = [
    {
      name: 'HDRezka',
      icon: '🎬',
      host: 'https://rezka.ag',
      api: 'https://voidboost.net/embed/',
      disabled: false
    },
    {
      name: 'Filmix',
      icon: '🎥',
      host: 'https://filmix.fm',
      api: 'https://filmix.fm/api/v2/',
      disabled: false
    },
    {
      name: 'Collaps',
      icon: '📺',
      host: 'https://api.collaps.top',
      api: 'https://api.collaps.top/',
      disabled: false
    },
    {
      name: 'Alloha',
      icon: '🎞️',
      host: 'https://alloha.tv',
      api: 'https://api.alloha.tv/',
      disabled: false
    },
    {
      name: 'Kodik',
      icon: '▶️',
      host: 'https://kodik.info',
      api: 'https://kodik.info/search',
      disabled: false
    },
    {
      name: 'VideoAPI',
      icon: '🎦',
      host: 'https://videoapi.tv',
      api: 'https://videoapi.tv/',
      disabled: false
    },
    {
      name: 'VidSrc',
      icon: '🌐',
      host: 'https://vidsrc.me',
      api: 'https://vidsrc.me/embed/',
      disabled: false
    }
  ];

  // Компонент плагина
  function component(object) {
    var network = new Lampa.Reguest();
    var scroll = new Lampa.Scroll({ mask: true, over: true });
    var html = $('<div></div>');
    var active = 0;
    var sources = [];

    this.create = function() {
      var _this = this;
      console.log('ОНЛАЙН: Создание компонента для:', object.movie.title);
      
      this.activity.loader(true);
      html.append(scroll.render());
      
      scroll.append($('<div class="broadcast__text">⏳ Загрузка источников...</div>'));

      // Получаем ID фильма
      var kinopoisk_id = object.movie.id || object.movie.kinopoisk_id;
      var imdb_id = object.movie.imdb_id;
      var tmdb_id = object.movie.tmdb_id;
      
      console.log('ОНЛАЙН: IDs - KP:', kinopoisk_id, 'IMDB:', imdb_id, 'TMDB:', tmdb_id);

      // Формируем источники
      _this.buildSources(kinopoisk_id, imdb_id, tmdb_id);
      _this.activity.loader(false);

      return html;
    };

    this.buildSources = function(kp_id, imdb_id, tmdb_id) {
      scroll.clear();
      sources = [];

      balancers.forEach(function(balancer) {
        if (balancer.disabled) return;

        var source = {
          name: balancer.name,
          icon: balancer.icon,
          balancer: balancer,
          kp_id: kp_id,
          imdb_id: imdb_id,
          tmdb_id: tmdb_id
        };

        // Формируем URL для каждого балансера
        if (balancer.name === 'HDRezka') {
          source.url = balancer.api + kp_id;
        } else if (balancer.name === 'Filmix') {
          source.url = balancer.api + 'kp_id=' + kp_id;
        } else if (balancer.name === 'Collaps') {
          source.url = balancer.api + 'videos?kinopoisk_id=' + kp_id;
        } else if (balancer.name === 'Alloha') {
          source.url = balancer.api + '?imdb=' + (imdb_id || '');
        } else if (balancer.name === 'Kodik') {
          source.url = balancer.api + '?kinopoisk_id=' + kp_id + '&token=YOUR_TOKEN';
        } else if (balancer.name === 'VideoAPI') {
          source.url = balancer.api + 'kp/' + kp_id;
        } else if (balancer.name === 'VidSrc') {
          source.url = balancer.api + (imdb_id ? 'movie/' + imdb_id : 'movie/' + tmdb_id);
        }

        sources.push(source);
      });

      console.log('ОНЛАЙН: Создано источников:', sources.length);
      this.buildList();
    };

    this.buildList = function() {
      if (sources.length === 0) {
        scroll.append($('<div class="broadcast__text">😔 Нет доступных источников</div>'));
        Lampa.Controller.enable('content');
        return;
      }

      sources.forEach(function(source, index) {
        var title = source.icon + ' ' + source.name;
        var subtitle = 'Онлайн источник';

        var card = $('<div class="selector card"><div class="card__view"><div class="card__title">' + title + '</div><div class="card__subtitle">' + subtitle + '</div></div></div>');
        
        card.on('hover:focus', function() {
          active = index;
        });

        card.on('hover:enter', function() {
          console.log('ОНЛАЙН: Выбран источник:', source.name);
          openSource(source);
        });
        
        scroll.append(card);
      });
      
      Lampa.Controller.enable('content');
    };

    function openSource(source) {
      console.log('ОНЛАЙН: Открытие источника:', source);

      // Для iframe-балансеров
      if (['HDRezka', 'VidSrc', 'Filmix'].indexOf(source.name) !== -1) {
        openIframe(source);
      } 
      // Для API-балансеров
      else {
        loadFromAPI(source);
      }
    }

    function openIframe(source) {
      var modal = $('<div class="online-modal"><div class="online-modal__content"><div class="online-modal__head"><div class="online-modal__title">' + source.name + '</div><div class="online-modal__close selector">✕</div></div><iframe class="online-modal__iframe" src="' + source.url + '" frameborder="0" allowfullscreen></iframe></div></div>');
      
      modal.find('.online-modal__close').on('hover:enter', function() {
        modal.remove();
        Lampa.Controller.toggle('content');
      });

      $('body').append(modal);

      // Добавляем стили
      if (!$('#online-modal-style').length) {
        $('head').append('<style id="online-modal-style">.online-modal{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.9);z-index:10000;display:flex;align-items:center;justify-content:center}.online-modal__content{width:90%;height:90%;background:#000;border-radius:1em;overflow:hidden;display:flex;flex-direction:column}.online-modal__head{padding:1.5em;display:flex;justify-content:space-between;align-items:center;background:rgba(255,255,255,0.1)}.online-modal__title{font-size:1.5em;font-weight:bold}.online-modal__close{padding:0.5em 1em;background:rgba(255,255,255,0.2);border-radius:0.3em;cursor:pointer}.online-modal__iframe{flex:1;width:100%;height:100%}</style>');
      }

      Lampa.Controller.add('modal', {
        toggle: function() {},
        back: function() {
          modal.remove();
          Lampa.Controller.toggle('content');
        }
      });
      Lampa.Controller.toggle('modal');
    }

    function loadFromAPI(source) {
      Lampa.Noty.show('🔄 Загрузка из ' + source.name + '...');
      
      network.silent(source.url, function(data) {
        console.log('ОНЛАЙН: Ответ от API:', data);
        
        // Обработка разных форматов ответа
        var results = data.results || data.data || data.links || [];
        
        if (results.length > 0) {
          var videoUrl = results[0].url || results[0].link || results[0].iframe_url;
          
          if (videoUrl) {
            Lampa.Player.play({
              url: videoUrl,
              title: object.movie.title || object.movie.name,
              subtitle: source.name
            });
          } else {
            Lampa.Noty.show('❌ Не найдена ссылка для воспроизведения');
          }
        } else {
          Lampa.Noty.show('❌ Источник не вернул данных');
        }
      }, function(error) {
        console.error('ОНЛАЙН: Ошибка API:', error);
        Lampa.Noty.show('❌ Ошибка загрузки из ' + source.name);
      });
    }

    this.start = function() {
      Lampa.Controller.add('content', {
        toggle: function() { 
          Lampa.Controller.collectionSet(scroll.render()); 
          Lampa.Controller.collectionFocus(active, scroll.render()); 
        },
        left: function() { 
          if (Lampa.Navigator.canmove('left')) Lampa.Activity.backward(); 
        },
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
      html.remove();
    };
  }

  function startPlugin() {
    if (window.online_plugin_loaded) return;
    window.online_plugin_loaded = true;

    console.log('ОНЛАЙН: Регистрация компонента...');
    Lampa.Component.add('online_sources', component);

    // Добавляем кнопку на страницу фильма
    Lampa.Listener.follow('full', function(e) {
      if (e.type === 'complite') {
        var btn = $('<div class="full-start__button selector view--online"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12,2C6.48,2,2,6.48,2,12s4.48,10,10,10s10-4.48,10-10S17.52,2,12,2z M10,16.5v-9l6,4.5L10,16.5z"/></svg><span>Онлайн</span></div>');
        
        btn.on('hover:enter', function() {
          Lampa.Activity.push({
            title: 'Онлайн источники',
            component: 'online_sources',
            movie: e.data.movie,
            page: 1
          });
        });
        
        e.render.find('.full-start__buttons').append(btn);
        console.log('ОНЛАЙН: ✅ Кнопка добавлена');
      }
    });

    console.log('ОНЛАЙН: ✅ Плагин загружен');
  }

  if (window.Lampa) {
    startPlugin();
  } else {
    setTimeout(startPlugin, 1000);
  }

})();
