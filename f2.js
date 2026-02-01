(function () {
    'use strict';

    function Filmix(object) {
        var network = new Lampa.Regard();
        var scroll  = new Lampa.Scroll({mask: true, over: true});
        var files   = [];
        var filter_items = {};
        
        this.create = function () {
            var _this = this;
            var url = 'https://filmix.ac/api/v2/search?text=' + encodeURIComponent(object.title);
            
            network.silent(url, function (found) {
                if (found && found.length) {
                    _this.getLinks(found[0].post_id);
                } else {
                    Lampa.Noty.show('Filmix: Ничего не найдено');
                }
            });
            return scroll.render();
        };

        this.getLinks = function (id) {
            var token = Lampa.Storage.get('filmix_token','');
            var url = 'https://filmix.ac/api/v2/post/' + id + (token ? '?user_token=' + token : '');
            
            network.silent(url, function (data) {
                if (data && data.player_links) {
                    // Код парсинга и вывода серий/качеств
                    Lampa.Noty.show('Filmix: Контент найден');
                    // Тут Лампа подхватит стандартный плеер
                }
            });
        };
    }

    // Регистрация плагина в Лампе
    if (!window.plugin_filmix_ready) {
        window.plugin_filmix_ready = true;
        Lampa.Component.add('filmix', Filmix);
        
        // Кнопка настройки авторизации
        Lampa.Settings.listener.follow('open', function (e) {
            if (e.name == 'tmdb') { // Добавим в раздел TMDB для простоты
                var item = $('<div class="settings-param selector"><div class="settings-param__name">Filmix Token</div><div class="settings-param__value">Настроить</div></div>');
                item.on('hover:enter', function () {
                    var token = prompt('Введите ваш User Token с сайта Filmix (из раздела API)');
                    if (token) Lampa.Storage.set('filmix_token', token);
                });
                $('.settings-window').append(item);
            }
        });
    }
})();
