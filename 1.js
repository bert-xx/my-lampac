(function () {
    'use strict';

    // --- Глобальные настройки ---
    var public_api = 'https://bwa.to/php/online.php'; // Проверенный публичный сервер
    var fx_api_url = 'http://filmixapp.vip/api/v2/';
    var cors_proxy = 'https://cors.apn.monster/';

    // --- Настройки Filmix из твоего кода ---
    var fx_token = Lampa.Storage.get('fxapi_token', '');
    var fx_uid = Lampa.Storage.get('fxapi_uid', '');
    if (!fx_uid) {
        fx_uid = Lampa.Utils.uid(16);
        Lampa.Storage.set('fxapi_uid', fx_uid);
    }
    var dev_token = 'user_dev_apk=2.0.1&user_dev_id=' + fx_uid + '&user_dev_name=Lampa&user_dev_os=11&user_dev_vendor=FXAPI&user_dev_token=';

    function UnifiedComponent(object) {
        var network = new Lampa.Reguest();
        var scroll  = new Lampa.Scroll({mask: true, over: true});
        var files   = new Lampa.Explorer(object);
        var filter  = new Lampa.Filter(object);
        var source  = Lampa.Storage.get('unified_source', 'filmix');
        var results = [];

        this.create = function () {
            var _this = this;
            this.prepare();
            this.search();
            return files.render();
        };

        this.prepare = function () {
            files.appendFiles(scroll.render());
            files.appendHead(filter.render());
            scroll.body().addClass('torrent-list');
        };

        this.search = function () {
            this.activity.loader(true);
            scroll.clear();
            this.renderFilter();

            if (source === 'filmix') this.findFilmix();
            else this.findPublic();
        };

        // --- ЛОГИКА FILMIX ---
        this.findFilmix = function () {
            var _this = this;
            if (!fx_token) return this.authFilmix();

            var query = object.movie.title || object.movie.name;
            var url = fx_api_url + 'search?story=' + encodeURIComponent(query) + '&' + dev_token + fx_token;
            
            network.silent(url, function (json) {
                if (json && json.length) {
                    var year = (object.movie.release_date || object.movie.first_air_date || '0000').slice(0, 4);
                    var card = json.find(function(c) { return c.alt_name.indexOf(year) !== -1; }) || json[0];
                    _this.loadFxLinks(card.id);
                } else _this.empty();
            }, this.empty.bind(this));
        };

        this.loadFxLinks = function (id) {
            var _this = this;
            network.silent(fx_api_url + 'post/' + id + '?' + dev_token + fx_token, function (found) {
                _this.activity.loader(false);
                if (found && found.player_links) _this.drawFx(found);
                else _this.empty();
            }, this.empty.bind(this));
        };

        this.authFilmix = function () {
            var _this = this;
            network.quiet(fx_api_url + 'token_request?' + dev_token, function (found) {
                if (found.status == 'ok') {
                    Lampa.Modal.open({
                        title: 'Авторизация Filmix',
                        html: '<div style="padding: 20px; text-align: center;">Введите код на <b>filmix.my/consoles</b>:<br><br><h1 style="font-size: 3em">' + found.user_code + '</h1></div>',
                        onBack: function () { Lampa.Modal.close(); Lampa.Activity.backward(); }
                    });
                    var check = setInterval(function () {
                        network.silent(fx_api_url + 'user_profile?' + dev_token + found.code, function (json) {
                            if (json && json.user_data) {
                                clearInterval(check);
                                Lampa.Storage.set('fxapi_token', found.code);
                                fx_token = found.code;
                                Lampa.Modal.close();
                                _this.search();
                            }
                        });
                    }, 3000);
                }
            });
        };

        // --- ЛОГИКА ПУБЛИЧНЫХ БАЛАНСЕРОВ ---
        this.findPublic = function () {
            var _this = this;
            var url = public_api + '?id=' + object.movie.id + '&title=' + encodeURIComponent(object.movie.title);
            if (Lampa.Platform.is('browser')) url = cors_proxy + url;

            network.silent(url, function (json) {
                _this.activity.loader(false);
                if (json && json.length) _this.drawPublic(json);
                else if (json && json.data) _this.drawPublic(json.data); // На случай другого формата JSON
                else _this.empty();
            }, this.empty.bind(this));
        };

        // --- ОТРИСОВКА ---
        this.drawFx = function (data) {
            var _this = this;
            var playlist = data.player_links.movie || [];
            if (playlist.length === 0 && data.player_links.playlist) {
                // Если это сериал, Filmix отдает сложный объект, упростим для вывода
                this.empty('Сериалы Filmix временно доступны через выбор серий в самом плеере');
                return;
            }
            playlist.forEach(function (m) {
                var html = Lampa.Template.get('button_card', { title: m.translation, subtitle: 'Filmix' });
                html.on('hover:enter', function () {
                    Lampa.Player.play({ url: m.link, title: object.movie.title, card: object.movie });
                });
                _this.append(html);
            });
            Lampa.Controller.enable('content');
        };

        this.drawPublic = function (json) {
            var _this = this;
            json.forEach(function (s) {
                var html = Lampa.Template.get('button_card', { title: s.name || s.title, subtitle: s.balancer || 'Источник' });
                html.on('hover:enter', function () {
                    Lampa.Player.play({ url: s.url, title: object.movie.title, card: object.movie });
                });
                _this.append(html);
            });
            Lampa.Controller.enable('content');
        };

        this.append = function (item) {
            item.on('hover:focus', function (e) { scroll.update($(e.target), true); });
            scroll.append(item);
        };

        this.renderFilter = function () {
            var _this = this;
            filter.set('sort', [
                { title: 'Filmix', source: 'filmix', selected: source === 'filmix' },
                { title: 'Балансеры (Kodik, Rezka...)', source: 'public', selected: source === 'public' }
            ]);
            filter.onSelect = function (type, a) {
                source = a.source;
                Lampa.Storage.set('unified_source', a.source);
                Lampa.Select.close();
                _this.search();
            };
        };

        this.empty = function (m) {
            this.activity.loader(false);
            scroll.clear();
            this.renderFilter();
            scroll.append(Lampa.Template.get('empty', { title: 'Ничего не найдено', desc: m || '' }));
            Lampa.Controller.enable('content');
        };

        this.start = function () {
            Lampa.Controller.add('content', {
                toggle: function () { Lampa.Controller.collectionSet(scroll.render()); Lampa.Controller.collectionFocus(false, scroll.render()); },
                left: function () { Lampa.Controller.toggle('menu'); },
                up: function () { Lampa.Controller.toggle('head'); },
                back: function () { Lampa.Activity.backward(); }
            });
            Lampa.Controller.toggle('content');
        };

        this.pause = function () {};
        this.stop = function () {};
        this.destroy = function () { network.clear(); scroll.destroy(); files.destroy(); };
    }

    function init() {
        Lampa.Component.add('unified_online', UnifiedComponent);
        Lampa.Listener.follow('full', function (e) {
            if (e.type == 'complite') {
                var btn = $('<div class="full-start__button selector view--online"><span>Смотреть онлайн</span></div>');
                btn.on('hover:enter', function () {
                    Lampa.Activity.push({
                        title: 'Онлайн',
                        component: 'unified_online',
                        movie: e.data.movie,
                        page: 1
                    });
                });
                e.render.find('.full-start__buttons').append(btn);
            }
        });
    }

    if (!window.unified_online_loaded) {
        window.unified_online_loaded = true;
        init();
    }
})();
