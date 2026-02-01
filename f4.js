(function () {
    'use strict';

    // --- НАСТРОЙКИ ---
    // Вставьте свой TOKEN между кавычками, если не хотите вводить его в настройках
    var filmix_token = Lampa.Storage.get('filmix_mod_token', ''); 
    var filmix_proxy = 'https://cors.lampa.mx/'; // Прокси для обхода блокировок API

    function FilmixSolo() {
        var network = new Lampa.Regard();
        
        // Метод для поиска фильма
        this.search = function (object) {
            var _this = this;
            var search_title = object.title || object.name;
            var url = filmix_proxy + 'https://filmix.ac/api/v2/search?text=' + encodeURIComponent(search_title);

            network.silent(url, function (found) {
                if (found && found.length > 0) {
                    // Берем первый результат поиска
                    _this.getPost(found[0].post_id, object);
                } else {
                    Lampa.Noty.show('Filmix: Ничего не найдено');
                }
            }, function () {
                Lampa.Noty.show('Filmix: Ошибка сети');
            });
        };

        // Метод для получения ссылок
        this.getPost = function (post_id, object) {
            var token_param = filmix_token ? '&user_token=' + filmix_token : '';
            var url = filmix_proxy + 'https://filmix.ac/api/v2/post/' + post_id + '?device_id=lampa' + token_param;

            network.silent(url, function (data) {
                if (data && data.player_links) {
                    var links = data.player_links;
                    
                    // Если это сериал
                    if (data.player_links.playlist) {
                        Lampa.Noty.show('Открываю список серий...');
                        // Здесь можно вызвать стандартный выбор серий Lampa
                        // Для упрощения просто покажем сообщение.
                    } 
                    
                    // Вызываем плеер (пример для фильма)
                    if (data.player_links.movie && data.player_links.movie.length > 0) {
                        var video_url = data.player_links.movie[0].link;
                        Lampa.Player.play({
                            url: video_url,
                            title: object.title
                        });
                    }
                } else {
                    Lampa.Noty.show('Filmix: Ссылки не найдены (нужен PRO?)');
                }
            });
        };
    }

    // Добавляем кнопку в карточку фильма
    function addButton() {
        Lampa.Listener.follow('full', function (e) {
            if (e.type == 'complite') {
                var btn = $(`<div class="full-start__button selector">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M21 12L7 20V4L21 12Z" fill="white"/></svg>
                    <span>Смотреть на Filmix</span>
                </div>`);

                btn.on('hover:enter', function () {
                    var fs = new FilmixSolo();
                    fs.search(e.data.movie);
                });

                // Добавляем кнопку на экран
                $('.full-start__buttons').append(btn);
            }
        });
    }

    // Добавляем поле для токена в настройки Лампы
    function addSettings() {
        Lampa.Settings.listener.follow('open', function (e) {
            if (e.name == 'interface') { // Добавим в раздел "Интерфейс"
                var field = $(`<div class="settings-param selector" data-type="button">
                    <div class="settings-param__name">Filmix PRO Token</div>
                    <div class="settings-param__value">${filmix_token || 'Не установлен'}</div>
                </div>`);

                field.on('hover:enter', function () {
                    var new_token = prompt('Введите ваш User Token с сайта Filmix:');
                    if (new_token) {
                        Lampa.Storage.set('filmix_mod_token', new_token);
                        Lampa.Noty.show('Токен сохранен. Перезагрузите Лампу.');
                    }
                });
                $('.settings-window').append(field);
            }
        });
    }

    // Запуск плагина
    if (window.appready) {
        addButton();
        addSettings();
    } else {
        Lampa.Events.listener.follow('app', function (e) {
            if (e.type == 'ready') {
                addButton();
                addSettings();
            }
        });
    }
})();
