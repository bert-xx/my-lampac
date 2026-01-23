(function() {
    'use strict';

    // --- Настройки и переменные Filmix ---
    var fxapi_token = Lampa.Storage.get('fxapi_token', '');
    var fxapi_uid = Lampa.Storage.get('fxapi_uid', '');
    if (!fxapi_uid) {
        fxapi_uid = Lampa.Utils.uid(16);
        Lampa.Storage.set('fxapi_uid', fxapi_uid);
    }
    var fx_api_url = 'http://filmixapp.vip/api/v2/';
    var fx_dev_token = 'user_dev_apk=2.0.1&user_dev_id=' + fxapi_uid + '&user_dev_name=Lampa&user_dev_os=11&user_dev_vendor=FXAPI&user_dev_token=';
    
    // --- Настройки публичных балансеров ---
    var public_api_url = 'https://lam.mx/lite/events'; // Публичный API Lampa
    var cors_proxy = 'http://cors.cfhttp.top/';

    function UnifiedOnline(object) {
        var network = new Lampa.Reguest();
        var scroll = new Lampa.Scroll({mask: true, over: true});
        var files = new Lampa.Explorer(object);
        var filter = new Lampa.Filter(object);
        
        var sources = ['filmix', 'public'];
        var current_source = Lampa.Storage.get('online_last_source', 'filmix');
        var results = [];
        var initialized = false;

        this.create = function() {
            var _this = this;
            this.prepare();
            this.startSearch();
            return files.render();
        };

        this.prepare = function() {
            files.appendFiles(scroll.render());
            files.appendHead(filter.render());
            scroll.body().addClass('torrent-list');
            scroll.minus(files.render().find('.explorer__files-head'));
        };

        this.startSearch = function() {
            this.activity.loader(true);
            if (current_source === 'filmix') {
                this.searchFilmix();
            } else {
                this.searchPublic();
            }
        };

        // --- ЛОГИКА FILMIX ---
        this.searchFilmix = function() {
            var _this = this;
            if (!fxapi_token) return this.authFilmix();

            var query = object.movie.title || object.movie.name;
            var url = fx_api_url + 'search?story=' + encodeURIComponent(query) + '&' + fx_dev_token + fxapi_token;
            
            network.silent(url, function(json) {
                if (json && json.length) {
                    // Ищем максимально точное совпадение по году
                    var year = (object.movie.release_date || object.movie.first_air_date || '0000').slice(0, 4);
                    var card = json.find(function(c) { return c.alt_name.indexOf(year) !== -1; }) || json[0];
                    _this.loadFilmixLinks(card.id);
                } else {
                    _this.empty();
                }
            }, this.empty.bind(this));
        };

        this.loadFilmixLinks = function(id) {
            var _this = this;
            network.silent(fx_api_url + 'post/' + id + '?' + fx_dev_token + fxapi_token, function(found) {
                _this.activity.loader(false);
                if (found && found.player_links) {
                    _this.drawFilmix(found);
                } else _this.empty();
            }, this.empty.bind(this));
        };

        this.authFilmix = function() {
            var _this = this;
            network.quiet(fx_api_url + 'token_request?' + fx_dev_token, function(found) {
                if (found.status == 'ok') {
                    Lampa.Modal.open({
                        title: 'Авторизация Filmix',
                        html: '<div>Введите код на <b>filmix.my/consoles</b>:<br><br><h1 style="text-align:center">' + found.user_code + '</h1></div>',
                        onBack: function() { Lampa.Modal.close(); Lampa.Activity.backward(); }
                    });
                    
                    var check = setInterval(function() {
                        network.silent(fx_api_url + 'user_profile?' + fx_dev_token + found.code, function(json) {
                            if (json && json.user_data) {
                                clearInterval(check);
                                Lampa.Storage.set('fxapi_token', found.code);
                                fxapi_token = found.code;
                                Lampa.Modal.close();
                                _this.startSearch();
                            }
                        });
                    }, 3000);
                }
            });
        };

        // --- ЛОГИКА ПУБЛИЧНЫХ БАЛАНСЕРОВ ---
        this.searchPublic = function() {
            var _this = this;
            var url = public_api_url + '?id=' + object.movie.id + '&title=' + encodeURIComponent(object.movie.title);
            if (Lampa.Platform.is('browser')) url = cors_proxy + url;

            network.silent(url, function(json) {
                _this.activity.loader(false);
                if (json && json.length) {
                    _this.drawPublic(json);
                } else _this.empty();
            }, this.empty.bind(this));
        };

        // --- ОТРИСОВКА ---
        this.drawFilmix = function(data) {
            var items = [];
            // Парсинг плейлиста Filmix (упрощенно)
            if (data.player_links.movie) {
                data.player_links.movie.forEach(function(m) {
                    items.push({ title: m.translation, url: m.link, quality: 'HD' });
                });
            }
            this.renderItems(items);
        };

        this.drawPublic = function(json) {
            var items = json.map(function(s) {
                return { title: s.name, url: s.url, quality: s.quality || '', subtitle: s.balancer };
            });
            this.renderItems(items);
        };

        this.renderItems = function(items) {
            var _this = this;
            scroll.clear();
            this.renderFilter();
            
            items.forEach(function(item) {
                var html = Lampa.Template.get('button_card', { title: item.title, subtitle: item.subtitle || item.quality });
                html.on('hover:enter', function() {
                    Lampa.Player.play({ url: item.url, title: object.movie.title, card: object.movie });
                });
                scroll.append(html);
            });
            Lampa.Controller.enable('content');
        };

        this.renderFilter = function() {
            filter.set('sort', [
                { title: 'Filmix', source: 'filmix', selected: current_source === 'filmix' },
                { title: 'Балансеры (Public)', source: 'public', selected: current_source === 'public' }
            ]);
            
            filter.onSelect = function(type, a, b) {
                if (type === 'sort') {
                    current_source = a.source;
                    Lampa.Storage.set('online_last_source', a.source);
                    Lampa.Select.close();
                    _this.startSearch();
                }
            };
        };

        this.empty = function() {
            this.activity.loader(false);
            scroll.clear();
            this.renderFilter();
            scroll.append(Lampa.Template.get('empty', {title: 'Ничего не найдено'}));
        };

        this.start = function() {
            Lampa.Controller.add('content', {
                toggle: function() { Lampa.Controller.collectionSet(scroll.render()); Lampa.Controller.collectionFocus(false, scroll.render()); },
                left: function() { Lampa.Controller.toggle('menu'); },
                up: function() { Lampa.Controller.toggle('head'); },
                back: function() { Lampa.Activity.backward(); }
            });
            Lampa.Controller.toggle('content');
        };

        this.pause = function() {};
        this.stop = function() {};
        this.destroy = function() { network.clear(); scroll.destroy(); files.destroy(); };
    }

    // Регистрация в Lampa
    function start() {
        Lampa.Component.add('fx_unified', UnifiedOnline);
        Lampa.Listener.follow('full', function(e) {
            if (e.type == 'complite') {
                var btn = $('<div class="full-start__button selector view--online"><span>Смотреть онлайн</span></div>');
                btn.on('hover:enter', function() {
                    Lampa.Activity.push({
                        title: 'Онлайн',
                        component: 'fx_unified',
                        movie: e.data.movie,
                        page: 1
                    });
                });
                e.render.find('.full-start__buttons').append(btn);
            }
        });
    }

    if (!window.fx_unified_plugin) {
        window.fx_unified_plugin = true;
        start();
    }
})();
