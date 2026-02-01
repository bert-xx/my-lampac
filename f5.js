(function () {
    'use strict';

    // --- НАСТРОЙКИ ---
    var filmix_token = Lampa.Storage.get('filmix_mod_token', '');
    var filmix_proxy = 'https://cors.lampa.mx/';
    var plugin_name = 'Filmix Mod';
    
    // Кеш для результатов поиска (уменьшает количество запросов)
    var search_cache = {};

    function FilmixSolo() {
        var network = new Lampa.Regard();
        
        // Основной метод поиска
        this.search = function (object) {
            var _this = this;
            var search_title = object.title || object.name;
            var year = object.year ? ' ' + object.year : '';
            var search_query = encodeURIComponent(search_title + year);
            
            // Проверяем кеш
            var cache_key = search_query.toLowerCase();
            if (search_cache[cache_key]) {
                setTimeout(function() {
                    _this.getPost(search_cache[cache_key], object);
                }, 100);
                return;
            }
            
            var url = filmix_proxy + 'https://filmix.ac/api/v2/search?text=' + search_query;
            
            network.native(url, function (response) {
                if (response && response.status === 200 && response.json) {
                    var data = response.json();
                    if (data && data.length > 0) {
                        // Сохраняем в кеш
                        search_cache[cache_key] = data[0].post_id;
                        _this.getPost(data[0].post_id, object);
                    } else {
                        Lampa.Noty.show(plugin_name + ': Ничего не найдено');
                    }
                } else {
                    Lampa.Noty.show(plugin_name + ': Ошибка поиска');
                }
            }, function (error) {
                console.error('Filmix search error:', error);
                Lampa.Noty.show(plugin_name + ': Ошибка сети');
            });
        };

        // Получение данных о фильме/сериале
        this.getPost = function (post_id, object) {
            var token_param = filmix_token ? '&user_token=' + filmix_token : '';
            var url = filmix_proxy + 'https://filmix.ac/api/v2/post/' + post_id + '?device_id=lampa' + token_param;
            
            network.native(url, function (response) {
                if (response && response.status === 200 && response.json) {
                    var data = response.json();
                    
                    if (data && data.player_links) {
                        if (data.player_links.playlist && data.player_links.playlist.length > 0) {
                            // Обработка сериала
                            _this.showSeasons(data.player_links.playlist, object, data.title || object.title);
                        } else if (data.player_links.movie && data.player_links.movie.length > 0) {
                            // Обработка фильма
                            _this.playMovie(data.player_links.movie, object);
                        } else {
                            Lampa.Noty.show(plugin_name + ': Нет доступных источников');
                        }
                    } else if (data && data.error) {
                        if (data.error.code === 401) {
                            Lampa.Noty.show(plugin_name + ': Неверный токен или требуется PRO');
                            _this.showTokenDialog();
                        } else {
                            Lampa.Noty.show(plugin_name + ': ' + (data.error.message || 'Ошибка API'));
                        }
                    } else {
                        Lampa.Noty.show(plugin_name + ': Данные не получены');
                    }
                } else {
                    Lampa.Noty.show(plugin_name + ': Ошибка сервера ' + (response ? response.status : ''));
                }
            }, function (error) {
                console.error('Filmix getPost error:', error);
                Lampa.Noty.show(plugin_name + ': Ошибка соединения');
            });
        };

        // Воспроизведение фильма
        this.playMovie = function (sources, object) {
            if (!sources || sources.length === 0) {
                Lampa.Noty.show(plugin_name + ': Нет видео источников');
                return;
            }
            
            // Выбираем лучший источник (обычно первый)
            var source = sources[0];
            var qualities = {};
            
            // Создаем список качеств
            if (source.qualities) {
                source.qualities.forEach(function(quality) {
                    qualities[quality.quality + 'p'] = quality.link;
                });
            } else if (source.link) {
                qualities['Источник'] = source.link;
            }
            
            if (Object.keys(qualities).length > 0) {
                Lampa.Player.play({
                    url: qualities,
                    title: object.title || 'Filmix',
                    translation: source.translation_name || 'Оригинал'
                });
            } else {
                Lampa.Noty.show(plugin_name + ': Не удалось получить ссылку');
            }
        };

        // Показ списка сезонов и серий
        this.showSeasons = function (playlist, object, title) {
            var items = [];
            
            // Создаем структуру для плеера Lampa
            playlist.forEach(function(season, seasonIndex) {
                if (season.series && season.series.length > 0) {
                    season.series.forEach(function(episode, episodeIndex) {
                        if (episode.link) {
                            items.push({
                                title: 'Сезон ' + (seasonIndex + 1) + ' Серия ' + (episodeIndex + 1),
                                file: episode.link,
                                episode: episodeIndex + 1,
                                season: seasonIndex + 1
                            });
                        }
                    });
                }
            });
            
            if (items.length > 0) {
                // Используем стандартный селектор серий Lampa
                Lampa.Player.play({
                    url: items,
                    title: title || object.title,
                    type: 'serial'
                });
            } else {
                Lampa.Noty.show(plugin_name + ': Нет доступных серий');
            }
        };

        // Диалог для ввода токена
        this.showTokenDialog = function () {
            Lampa.Dialog.confirm({
                title: plugin_name,
                text: 'Требуется PRO токен Filmix. Хотите ввести его сейчас?',
                accept: 'Ввести',
                cancel: 'Отмена'
            }, function (result) {
                if (result) {
                    var new_token = prompt('Введите ваш User Token с сайта Filmix:');
                    if (new_token && new_token.trim().length > 10) {
                        Lampa.Storage.set('filmix_mod_token', new_token.trim());
                        filmix_token = new_token.trim();
                        Lampa.Noty.show('Токен сохранен! Перезапустите поиск.');
                    } else if (new_token) {
                        Lampa.Noty.show('Токен слишком короткий');
                    }
                }
            });
        };
    }

    // Добавление кнопки в интерфейс
    function addButton() {
        // Очищаем старый слушатель если был
        if (window.filmix_full_listener) {
            Lampa.Listener.remove('full', window.filmix_full_listener);
        }
        
        window.filmix_full_listener = Lampa.Listener.follow('full', function (e) {
            if (e.type == 'complite') {
                var container = $('.full-start__buttons');
                if (container.length === 0) {
                    // Пробуем другие возможные контейнеры
                    container = $('.full-start .full-buttons-selector');
                    if (container.length === 0) return;
                }
                
                // Удаляем старую кнопку если есть
                $('.filmix-button').remove();
                
                var btn = $(`<div class="filmix-button full-start__button selector" style="margin-top: 10px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="#FF6B00">
                            <path d="M21 12L7 20V4L21 12Z"/>
                        </svg>
                        <span style="color: #FF6B00;">Filmix</span>
                    </div>
                </div>`);
                
                btn.on('hover:enter', function () {
                    var fs = new FilmixSolo();
                    fs.search(e.data.movie || e.data);
                });
                
                container.append(btn);
            }
        });
    }

    // Добавление настроек в интерфейс Lampa
    function addSettings() {
        Lampa.Settings.listener.follow('open', function (e) {
            if (e.name == 'interface') {
                // Удаляем старые настройки если есть
                $('.filmix-settings').remove();
                
                var field = $(`<div class="filmix-settings settings-param selector" data-type="button" style="border-top: 1px solid rgba(255,255,255,0.1); padding-top: 15px;">
                    <div class="settings-param__name" style="color: #FF6B00;">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="#FF6B00" style="vertical-align: middle; margin-right: 8px;">
                            <path d="M21 12L7 20V4L21 12Z"/>
                        </svg>
                        Filmix PRO
                    </div>
                    <div class="settings-param__value">${filmix_token ? 'Токен установлен' : 'Не установлен'}</div>
                </div>`);
                
                field.on('hover:enter', function () {
                    Lampa.Dialog.confirm({
                        title: 'Filmix PRO Token',
                        text: filmix_token ? 
                            'Текущий токен: ' + filmix_token.substring(0, 5) + '...\nЗаменить его?' : 
                            'Введите PRO токен с filmix.ac',
                        accept: filmix_token ? 'Заменить' : 'Ввести',
                        cancel: filmix_token ? 'Удалить' : 'Отмена'
                    }, function (result) {
                        if (result) {
                            var new_token = prompt('Введите ваш User Token с сайта Filmix:');
                            if (new_token) {
                                Lampa.Storage.set('filmix_mod_token', new_token);
                                filmix_token = new_token;
                                Lampa.Noty.show('Токен сохранен');
                                setTimeout(function() {
                                    Lampa.Settings.update();
                                }, 1000);
                            }
                        } else if (filmix_token) {
                            Lampa.Storage.set('filmix_mod_token', '');
                            filmix_token = '';
                            Lampa.Noty.show('Токен удален');
                            setTimeout(function() {
                                Lampa.Settings.update();
                            }, 1000);
                        }
                    });
                });
                
                $('.settings-window').append(field);
            }
        });
    }

    // Инициализация плагина
    function initPlugin() {
        console.log(plugin_name + ' initializing...');
        
        // Добавляем стили для кнопки
        if (!$('#filmix-styles').length) {
            $('head').append(`
                <style id="filmix-styles">
                    .filmix-button:hover {
                        background: rgba(255, 107, 0, 0.15) !important;
                    }
                    .filmix-button .selector-focus {
                        background: rgba(255, 107, 0, 0.25) !important;
                    }
                </style>
            `);
        }
        
        addButton();
        addSettings();
        
        // Периодическая очистка кеша (каждые 30 минут)
        setInterval(function() {
            search_cache = {};
        }, 30 * 60 * 1000);
    }

    // Запуск
    if (window.appready) {
        setTimeout(initPlugin, 1000);
    } else {
        Lampa.Events.listener.follow('app', function (e) {
            if (e.type == 'ready') {
                setTimeout(initPlugin, 1000);
            }
        });
    }
})();
