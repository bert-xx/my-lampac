(function () {
    'use strict';

    // --- НАСТРОЙКИ ---
    var filmix_token = Lampa.Storage.get('filmix_mod_token', '');
    var filmix_proxy = 'https://cors.lampa.mx/';
    var plugin_name = 'Filmix Mod';
    
    // Кеш для результатов поиска
    var search_cache = {};

    // Главный класс плагина
    function FilmixPlugin() {
        var network = new Lampa.Regard();
        
        // Поиск контента
        this.search = function (object) {
            var _this = this;
            var search_title = object.title || object.name;
            var year = object.year ? ' ' + object.year : '';
            var search_query = encodeURIComponent(search_title + year);
            
            // Проверка кеша
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
                    Lampa.Noty.show(plugin_name + ': Ошибка поиска (статус: ' + (response ? response.status : 'нет ответа') + ')');
                }
            }, function (error) {
                console.error('Filmix search error:', error);
                Lampa.Noty.show(plugin_name + ': Ошибка сети');
            });
        };

        // Получение данных
        this.getPost = function (post_id, object) {
            var token_param = filmix_token ? '&user_token=' + filmix_token : '';
            var url = filmix_proxy + 'https://filmix.ac/api/v2/post/' + post_id + '?device_id=lampa' + token_param;
            
            network.native(url, function (response) {
                if (response && response.status === 200 && response.json) {
                    var data = response.json();
                    
                    if (data && data.player_links) {
                        if (data.player_links.playlist && data.player_links.playlist.length > 0) {
                            // Сериал
                            _this.showSeasons(data.player_links.playlist, object, data.title || object.title);
                        } else if (data.player_links.movie && data.player_links.movie.length > 0) {
                            // Фильм
                            _this.playMovie(data.player_links.movie, object);
                        } else {
                            Lampa.Noty.show(plugin_name + ': Нет доступных источников');
                        }
                    } else if (data && data.error) {
                        if (data.error.code === 401) {
                            Lampa.Noty.show(plugin_name + ': Требуется авторизация');
                            _this.showAuthDialog();
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
            
            // Собираем все доступные качества
            var qualities = {};
            
            sources.forEach(function(source, index) {
                if (source.qualities && source.qualities.length > 0) {
                    source.qualities.forEach(function(quality) {
                        var qualityName = quality.quality + 'p';
                        if (source.translation_name) {
                            qualityName += ' (' + source.translation_name + ')';
                        }
                        qualities[qualityName] = quality.link;
                    });
                } else if (source.link) {
                    var sourceName = 'Источник ' + (index + 1);
                    if (source.translation_name) {
                        sourceName += ' (' + source.translation_name + ')';
                    }
                    qualities[sourceName] = source.link;
                }
            });
            
            if (Object.keys(qualities).length > 0) {
                Lampa.Player.play({
                    url: qualities,
                    title: object.title || 'Filmix',
                    subtitle: 'Filmix'
                });
            } else {
                Lampa.Noty.show(plugin_name + ': Не удалось получить ссылки');
            }
        };

        // Показ сезонов и серий
        this.showSeasons = function (playlist, object, title) {
            var items = [];
            
            playlist.forEach(function(season, seasonIndex) {
                if (season.series && season.series.length > 0) {
                    season.series.forEach(function(episode, episodeIndex) {
                        if (episode.link) {
                            var episodeTitle = 'S' + (seasonIndex + 1).toString().padStart(2, '0') + 
                                             'E' + (episodeIndex + 1).toString().padStart(2, '0');
                            
                            if (episode.title) {
                                episodeTitle += ' - ' + episode.title;
                            }
                            
                            items.push({
                                title: episodeTitle,
                                file: episode.link,
                                episode: episodeIndex + 1,
                                season: seasonIndex + 1
                            });
                        }
                    });
                }
            });
            
            if (items.length > 0) {
                Lampa.Player.play({
                    url: items,
                    title: title || object.title,
                    type: 'serial',
                    subtitle: 'Filmix'
                });
            } else {
                Lampa.Noty.show(plugin_name + ': Нет доступных серий');
            }
        };

        // Диалог авторизации
        this.showAuthDialog = function () {
            Lampa.Dialog.confirm({
                title: plugin_name + ' - Авторизация',
                text: 'Для доступа к Filmix требуется PRO аккаунт.\n\n' +
                      '1. Зарегистрируйтесь на filmix.ac\n' +
                      '2. Приобретите PRO подписку\n' +
                      '3. Получите токен в личном кабинете\n\n' +
                      'Хотите ввести токен сейчас?',
                accept: 'Ввести токен',
                cancel: 'Позже'
            }, function (result) {
                if (result) {
                    showTokenInput();
                }
            });
        };
    }

    // Функция ввода токена
    function showTokenInput() {
        var html = `
            <div style="padding: 20px; max-width: 500px;">
                <div style="margin-bottom: 20px; color: #FF6B00; font-size: 18px; font-weight: bold;">
                    🔐 Ввод токена Filmix
                </div>
                
                <div style="margin-bottom: 15px; background: rgba(255,107,0,0.1); padding: 15px; border-radius: 8px;">
                    <div style="font-weight: bold; margin-bottom: 10px;">Как получить токен:</div>
                    <div>1. Войдите на <a href="https://filmix.ac" target="_blank" style="color: #FF6B00;">filmix.ac</a></div>
                    <div>2. Перейдите в "Мой профиль" → "API ключи"</div>
                    <div>3. Скопируйте ваш User Token</div>
                </div>
                
                <input type="text" id="filmix_token_input" 
                       placeholder="Вставьте ваш токен здесь" 
                       style="width: 100%; padding: 12px; margin-bottom: 15px; 
                              background: rgba(255,255,255,0.1); border: 2px solid #FF6B00; 
                              border-radius: 8px; color: white; font-size: 16px;">
                
                <div style="display: flex; gap: 10px; justify-content: flex-end;">
                    <button id="filmix_token_cancel" style="padding: 10px 20px; background: #555; border: none; border-radius: 6px; color: white; cursor: pointer;">
                        Отмена
                    </button>
                    <button id="filmix_token_save" style="padding: 10px 20px; background: #FF6B00; border: none; border-radius: 6px; color: white; font-weight: bold; cursor: pointer;">
                        Сохранить
                    </button>
                </div>
            </div>
        `;
        
        Lampa.Dialog.create({
            html: html,
            width: 550,
            height: 350,
            onBack: true
        });
        
        // Фокус на поле ввода
        setTimeout(function() {
            var input = document.getElementById('filmix_token_input');
            if (input) input.focus();
        }, 100);
        
        // Обработчики кнопок
        $('#filmix_token_cancel').on('click', function() {
            Lampa.Dialog.clear();
        });
        
        $('#filmix_token_save').on('click', function() {
            var token = $('#filmix_token_input').val().trim();
            if (token && token.length > 10) {
                Lampa.Storage.set('filmix_mod_token', token);
                filmix_token = token;
                Lampa.Noty.show('✅ Токен сохранен!');
                Lampa.Dialog.clear();
                
                // Обновляем отображение в настройках
                updateSettingsDisplay();
            } else {
                Lampa.Noty.show('❌ Токен слишком короткий');
            }
        });
        
        // Enter для сохранения
        $('#filmix_token_input').on('keyup', function(e) {
            if (e.keyCode === 13) {
                $('#filmix_token_save').click();
            }
        });
    }

    // Добавление кнопки в третьем порядке
    function addFilmixButton() {
        // Удаляем старые слушатели
        if (window.filmix_button_listener) {
            Lampa.Listener.remove('full', window.filmix_button_listener);
        }
        
        window.filmix_button_listener = Lampa.Listener.follow('full', function (e) {
            if (e.type == 'complite') {
                // Ждем пока появятся все кнопки
                setTimeout(function() {
                    var container = $('.full-start__buttons');
                    if (container.length === 0) return;
                    
                    // Удаляем старую кнопку если есть
                    $('.filmix-third-button').remove();
                    
                    // Получаем существующие кнопки
                    var existingButtons = container.find('.full-start__button');
                    
                    // Создаем нашу кнопку
                    var btn = $(`
                        <div class="filmix-third-button full-start__button selector" 
                             style="order: 3; margin-top: 0;">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="#FF6B00">
                                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                                </svg>
                                <span style="color: #FF6B00; font-weight: 500;">Filmix</span>
                            </div>
                        </div>
                    `);
                    
                    // Обработчик клика
                    btn.on('hover:enter', function () {
                        var content = e.data.movie || e.data;
                        if (content) {
                            var fs = new FilmixPlugin();
                            fs.search(content);
                        }
                    });
                    
                    // Добавляем кнопку в третью позицию
                    if (existingButtons.length >= 2) {
                        // Вставляем после второй кнопки
                        $(existingButtons[1]).after(btn);
                    } else if (existingButtons.length === 1) {
                        // Вставляем после первой кнопки
                        $(existingButtons[0]).after(btn);
                    } else {
                        // Просто добавляем
                        container.append(btn);
                    }
                }, 300); // Задержка для загрузки всех кнопок
            }
        });
    }

    // Обновление отображения в настройках
    function updateSettingsDisplay() {
        $('.filmix-settings .settings-param__value').text(
            filmix_token ? 
            '✅ Авторизован (' + filmix_token.substring(0, 6) + '...)' : 
            '❌ Не авторизован'
        );
    }

    // Добавление настроек с авторизацией
    function addAuthSettings() {
        Lampa.Settings.listener.follow('open', function (e) {
            if (e.name == 'account') {
                // Удаляем старые настройки
                $('.filmix-auth-settings').remove();
                
                var isAuthorized = filmix_token && filmix_token.length > 10;
                
                var settingsHTML = `
                    <div class="filmix-auth-settings" style="margin-top: 20px; border-top: 1px solid rgba(255,107,0,0.3); padding-top: 20px;">
                        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 15px;">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="#FF6B00">
                                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                            </svg>
                            <div style="font-size: 18px; font-weight: bold; color: #FF6B00;">Filmix PRO</div>
                        </div>
                        
                        <div class="settings-param selector" data-type="button" 
                             style="background: ${isAuthorized ? 'rgba(0,255,0,0.1)' : 'rgba(255,0,0,0.1)'}; 
                                    padding: 15px; border-radius: 8px; margin-bottom: 15px;">
                            <div class="settings-param__name" style="font-size: 16px;">
                                Статус авторизации
                            </div>
                            <div class="settings-param__value" style="font-size: 14px; color: ${isAuthorized ? '#0f0' : '#f00'}">
                                ${isAuthorized ? '✅ Авторизован' : '❌ Не авторизован'}
                            </div>
                        </div>
                        
                        <div class="settings-param selector" data-type="button" 
                             style="padding: 12px 15px; border-radius: 8px; margin-bottom: 10px; background: rgba(255,107,0,0.1);">
                            <div class="settings-param__name">
                                ${isAuthorized ? 'Изменить токен' : 'Войти в аккаунт'}
                            </div>
                            <div class="settings-param__value">→</div>
                        </div>
                        
                        ${isAuthorized ? `
                        <div class="settings-param selector" data-type="button" 
                             style="padding: 12px 15px; border-radius: 8px; background: rgba(255,0,0,0.1);">
                            <div class="settings-param__name" style="color: #ff5555;">
                                Выйти из аккаунта
                            </div>
                            <div class="settings-param__value">×</div>
                        </div>
                        ` : ''}
                        
                        <div style="margin-top: 20px; padding: 15px; background: rgba(255,107,0,0.05); border-radius: 8px; font-size: 12px; color: #aaa;">
                            <div style="margin-bottom: 5px;">ℹ️ Для доступа к Filmix требуется:</div>
                            <div>• Аккаунт на filmix.ac</div>
                            <div>• PRO подписка</div>
                            <div>• User Token из личного кабинета</div>
                        </div>
                    </div>
                `;
                
                var settingsElement = $(settingsHTML);
                
                // Обработчик входа/изменения токена
                settingsElement.find('.settings-param:nth-child(3)').on('hover:enter', function() {
                    showTokenInput();
                });
                
                // Обработчик выхода
                if (isAuthorized) {
                    settingsElement.find('.settings-param:nth-child(4)').on('hover:enter', function() {
                        Lampa.Dialog.confirm({
                            title: 'Выход из Filmix',
                            text: 'Вы уверены, что хотите удалить токен?',
                            accept: 'Выйти',
                            cancel: 'Отмена'
                        }, function(result) {
                            if (result) {
                                Lampa.Storage.set('filmix_mod_token', '');
                                filmix_token = '';
                                Lampa.Noty.show('✅ Токен удален');
                                setTimeout(function() {
                                    Lampa.Settings.update();
                                }, 500);
                            }
                        });
                    });
                }
                
                $('.settings-window').append(settingsElement);
            }
        });
    }

    // Инициализация плагина
    function initPlugin() {
        console.log(plugin_name + ' инициализирован');
        
        // Добавляем стили
        if (!$('#filmix-plugin-styles').length) {
            $('head').append(`
                <style id="filmix-plugin-styles">
                    .filmix-third-button {
                        background: rgba(255, 107, 0, 0.1) !important;
                        border: 1px solid rgba(255, 107, 0, 0.3) !important;
                    }
                    .filmix-third-button:hover {
                        background: rgba(255, 107, 0, 0.2) !important;
                        transform: scale(1.02);
                        transition: all 0.2s;
                    }
                    .filmix-third-button .selector-focus {
                        background: rgba(255, 107, 0, 0.3) !important;
                        box-shadow: 0 0 0 2px rgba(255, 107, 0, 0.5);
                    }
                </style>
            `);
        }
        
        addFilmixButton();
        addAuthSettings();
        
        // Очистка кеша каждые 30 минут
        setInterval(function() {
            search_cache = {};
        }, 30 * 60 * 1000);
    }

    // Запуск
    if (window.appready) {
        setTimeout(initPlugin, 1500);
    } else {
        Lampa.Events.listener.follow('app', function (e) {
            if (e.type == 'ready') {
                setTimeout(initPlugin, 1500);
            }
        });
    }
})();
