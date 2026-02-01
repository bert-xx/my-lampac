(function () {
    'use strict';

    Lampa.Platform.tv();

    function FilmixSolo(object) {
        var network = new Lampa.Regard();
        var scroll = new Lampa.Scroll({mask: true, over: true});
        var items = [];
        var info;

        // Основной API Filmix
        var api_url = 'http://filmix.ac/api/v2/';
        var user_token = Lampa.Storage.get('filmix_token', '');

        this.create = function () {
            var _this = this;
            this.start();
            return this.render();
        };

        this.start = function () {
            var url = api_url + 'search?text=' + encodeURIComponent(object.title);
            
            network.silent(url, function (found) {
                if (found && found.length) {
                    _this.getFile(found[0].post_id);
                } else {
                    _this.empty('Ничего не найдено на Filmix');
                }
            });
        };

        this.getFile = function (post_id) {
            var _this = this;
            var url = api_url + 'post/' + post_id + (user_token ? '?user_token=' + user_token : '');
            
            network.silent(url, function (data) {
                if (data) {
                    _this.buildLinks(data);
                }
            });
        };

        this.buildLinks = function (data) {
            var _this = this;
            Lampa.Select.show({
                title: 'Filmix Quality',
                items: [
                    { title: '720p', quality: '720' },
                    { title: '1080p (PRO)', quality: '1080' },
                    { title: '4K (PRO+)', quality: '2160' }
                ],
                onSelect: function (item) {
                    // Здесь логика запуска плеера
                    var video_url = data.player_links.movie[0].link; // Упрощенно
                    var playlist = {
                        title: object.title,
                        url: video_url
                    };
                    Lampa.Player.play(playlist);
                }
            });
        };

        this.empty = function (msg) {
            // Отрисовка пустого экрана
        };
    }

    // Добавление настроек и авторизации
    function addSettings() {
        Lampa.SettingsApi.add({
            title: 'Filmix PRO',
            component: 'filmix_solo',
            icon: '<svg height="36" viewBox="0 0 24 24" width="36"><path d="M18 4H6c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zM8 15H6v-2h2v2zm0-4H6V9h2v2zm4 4h-2v-2h2v2zm0-4h-2V9h2v2zm4 4h-2v-2h2v2zm0-4h-2V9h2v2z" fill="white"/></svg>'
        });

        Lampa.Settings.listener.follow('open', function (e) {
            if (e.name == 'filmix_solo') {
                var field = $(`<div class="settings-param selector" data-type="button" data-name="filmix_auth">
                    <div class="settings-param__name">Авторизовать устройство</div>
                    <div class="settings-param__value">Получить код</div>
                </div>`);

                field.on('hover:enter', function () {
                    Lampa.Regard.network('http://filmix.ac/api/v2/get_device_code', function (res) {
                        if (res && res.user_code) {
                            Lampa.Noty.show('Введите код: ' + res.user_code + ' на сайте filmix.ac/device');
                            
                            // Проверка токена каждые 20 сек
                            var timer = setInterval(function(){
                                Lampa.Regard.network('http://filmix.ac/api/v2/get_device_token?user_code=' + res.user_code, function(token){
                                    if(token.user_token){
                                        Lampa.Storage.set('filmix_token', token.user_token);
                                        Lampa.Noty.show('Filmix PRO активирован!');
                                        clearInterval(timer);
                                    }
                                });
                            }, 20000);
                        }
                    });
                });
                $('.settings-window').append(field);
            }
        });
    }

    if (window.appready) addSettings();
    else Lampa.Events.listener.follow('app', function (e) { if (e.type == 'ready') addSettings(); });

    // Кнопка в карточке фильма
    Lampa.Component.add('filmix_solo', FilmixSolo);
    Lampa.Listener.follow('full', function (e) {
        if (e.type == 'complite') {
            var btn = $(`<div class="full-start__button selector">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                <span>Filmix</span>
            </div>`);

            btn.on('hover:enter', function () {
                Lampa.Component.add('filmix_solo', FilmixSolo);
                Lampa.Controller.main().push({
                    component: 'filmix_solo',
                    title: 'Filmix',
                    object: e.data.movie
                });
            });
            $('.full-start__buttons').append(btn);
        }
    });

})();
