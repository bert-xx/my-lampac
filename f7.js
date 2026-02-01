(function () {
    'use strict';

    // --- НАСТРОЙКИ ---
    var filmix_token = Lampa.Storage.get('filmix_mod_token', '');
    var filmix_domain = Lampa.Storage.get('filmix_domain', 'filmix.my'); // Основной домен
    var filmix_proxy = 'https://cors.lampa.mx/';
    var plugin_name = 'Filmix Mod';
    
    // Кеш для результатов поиска
    var search_cache = {};

    // Главный класс плагина
    function FilmixPlugin() {
        var network = new Lampa.Regard();
        
        // Получение текущего домена API
        this.getApiDomain = function() {
            return filmix_domain.replace(/^https?:\/\//, '');
        };

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
            
            var domain = _this.getApiDomain();
            var url = filmix_proxy + 'https://' + domain + '/api/v2/search?text=' + search_query;
            
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
            var domain = this.getApiDomain();
            var url = filmix_proxy + 'https://' + domain + '/api/v2/post/' + post_id + '?device_id=lampa' + token_param;
            
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
                      '1. Зарегистрируйтесь на выбранном домене\n' +
                      '2. Приобретите PRO подписку\n' +
                      '3. Получите токен в личном кабинете\n\n' +
                      'Хотите настроить сейчас?',
                accept: 'Настроить',
                cancel: 'Позже'
            }, function (result) {
                if (result) {
                    showAuthPanel();
                }
            });
        };
    }

    // Панель авторизации и настроек
    function showAuthPanel() {
        var html = `
            <div style="padding: 20px; max-width: 600px;">
                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 20px;">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="#FF6B00">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                    </svg>
                    <div style="font-size: 20px; font-weight: bold; color: #FF6B00;">Настройки Filmix</div>
                </div>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 25px;">
                    <div style="background: rgba(255,107,0,0.1); padding: 15px; border-radius: 8px;">
                        <div style="font-weight: bold; margin-bottom: 10px; color: #FF6B00;">🎯 Домен Filmix</div>
                        <div style="margin-bottom: 10px; font-size: 14px;">Выберите доступный домен:</div>
                        <div style="display: flex; flex-direction: column; gap: 8px;">
                            <label style="display: flex; align-items: center; gap: 8px;">
                                <input type="radio" name="filmix_domain" value="filmix.my" ${filmix_domain === 'filmix.my' ? 'checked' : ''}>
                                filmix.my (основной)
                            </label>
                            <label style="display: flex; align-items: center; gap: 8px;">
                                <input type="radio" name="filmix_domain" value="filmix.ac" ${filmix_domain === 'filmix.ac' ? 'checked' : ''}>
                                filmix.ac
                            </label>
                            <label style="display: flex; align-items: center; gap: 8px;">
                                <input type="radio" name="filmix_domain" value="filmix.live" ${filmix_domain === 'filmix.live' ? 'checked' : ''}>
                                filmix.live
                            </label>
                            <label style="display: flex; align-items: center; gap: 8px;">
                                <input type="radio" name="filmix_domain" value="custom" ${!['filmix.my','filmix.ac','filmix.live'].includes(filmix_domain) ? 'checked' : ''}>
                                Другой домен:
                            </label>
                        </div>
                        <input type="text" id="filmix_custom_domain" 
                               placeholder="your-domain.com" 
                               value="${!['filmix.my','filmix.ac','filmix.live'].includes(filmix_domain) ? filmix_domain : ''}"
                               style="width: 100%; padding: 8px; margin-top: 10px;
                                      background: rgba(255,255,255,0.1); border: 1px solid #666;
                                      border-radius: 6px; color: white; display: none;">
                    </div>
                    
                    <div style="background: rgba(0,150,255,0.1); padding: 15px; border-radius: 8px;">
                        <div style="font-weight: bold; margin-bottom: 10px; color: #0096FF;">🔑 Токен авторизации</div>
                        <div style="margin-bottom: 10px; font-size: 14px;">${filmix_token ? '✅ Токен установлен' : '❌ Токен не установлен'}</div>
                        <textarea id="filmix_token_input" 
                                  placeholder="Вставьте ваш User Token здесь..." 
                                  style="width: 100%; height: 80px; padding: 10px;
                                         background: rgba(255,255,255,0.1); border: 1px solid #666;
                                         border-radius: 6px; color: white; font-family: monospace; font-size: 12px;"
                                  ${filmix_token ? 'disabled' : ''}>${filmix_token || ''}</textarea>
                        ${filmix_token ? 
                            `<div style="margin-top: 10px; font-size: 12px; color: #0f0;">
                                Токен: ${filmix_token.substring(0, 8)}...${filmix_token.substring(filmix_token.length - 4)}
                            </div>` : 
                            ''
                        }
                    </div>
                </div>
                
                <div style="background: rgba(255,255,255,0.05); padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                    <div style="font-weight: bold; margin-bottom: 10px; color: #FFD700;">ℹ️ Инструкция:</div>
                    <div style="font-size: 12px; line-height: 1.4;">
                        1. Выберите доступный домен Filmix<br>
                        2. Зарегистрируйтесь на выбранном домене<br>
                        3. Приобретите PRO подписку<br>
                        4. В личном кабинете найдите "API ключи" или "User Token"<br>
                        5. Скопируйте токен и вставьте в поле выше
                    </div>
                </div>
                
                <div style="display: flex; gap: 10px; justify-content: flex-end;">
                    <button id="filmix_settings_cancel" 
                            style="padding: 10px 20px; background: #555; border: none; 
                                   border-radius: 6px; color: white; cursor: pointer;">
                        Отмена
                    </button>
                    <button id="filmix_settings_test" 
                            style="padding: 10px 20px; background: #0096FF; border: none; 
                                   border-radius: 6px; color: white; cursor: pointer;">
                        Проверить
                    </button>
                    <button id="filmix_settings_save" 
                            style="padding: 10px 20px; background: #FF6B00; border: none; 
                                   border-radius: 6px; color: white; font-weight: bold; cursor: pointer;">
                        Сохранить
                    </button>
                </div>
            </div>
        `;
        
        Lampa.Dialog.create({
            html: html,
            width: 650,
            height: 500,
            onBack: true
        });
        
        // Обработка выбора домена
        $('input[name="filmix_domain"]').on('change', function() {
            var customInput = $('#filmix_custom_domain');
            if ($(this).val() === 'custom') {
                customInput.show();
            } else {
                customInput.hide();
            }
        });
        
        // Инициализация кастомного поля
        if (!['filmix.my','filmix.ac','filmix.live'].includes(filmix_domain)) {
            $('#filmix_custom_domain').show();
        }
        
        // Кнопка "Сбросить токен"
        if (filmix_token) {
            $('<button id="filmix_settings_reset" style="padding: 10px 20px; background: #ff5555; border: none; border-radius: 6px; color: white; cursor: pointer; margin-right: auto;">Сбросить токен</button>')
                .insertBefore('#filmix_settings_cancel')
                .on('click', function() {
                    Lampa.Storage.set('filmix_mod_token', '');
                    filmix_token = '';
                    $('#filmix_token_input').val('').prop('disabled', false);
                    Lampa.Noty.show('Токен сброшен');
                });
        }
        
        // Обработчики кнопок
        $('#filmix_settings_cancel').on('click', function() {
            Lampa.Dialog.clear();
        });
        
        $('#filmix_settings_test').on('click', function() {
            testConnection();
        });
        
        $('#filmix_settings_save').on('click', function() {
            saveSettings();
        });
        
        // Enter для сохранения
        $(document).on('keyup', function(e) {
            if (e.keyCode === 13 && !$(e.target).is('textarea')) {
                saveSettings();
            }
        });
        
        function getSelectedDomain() {
            var selected = $('input[name="filmix_domain"]:checked').val();
            if (selected === 'custom') {
                return $('#filmix_custom_domain').val().trim().replace(/^https?:\/\//, '');
            }
            return selected;
        }
        
        function testConnection() {
            var domain = getSelectedDomain();
            if (!domain) {
                Lampa.Noty.show('❌ Введите домен');
                return;
            }
            
            Lampa.Noty.show('🔍 Проверка подключения к ' + domain + '...');
            
            var testUrl = filmix_proxy + 'https://' + domain + '/api/v2/search?text=test';
            var network = new Lampa.Regard();
            
            network.native(testUrl, function(response) {
                if (response && response.status === 200) {
                    Lampa.Noty.show('✅ Домен ' + domain + ' доступен');
                } else {
                    Lampa.Noty.show('⚠️ Домен доступен, но API ответил: ' + (response ? response.status : 'нет ответа'));
                }
            }, function(error) {
                Lampa.Noty.show('❌ Ошибка подключения к ' + domain);
            });
        }
        
        function saveSettings() {
            var domain = getSelectedDomain();
            var token = $('#filmix_token_input').val().trim();
            
            if (!domain) {
                Lampa.Noty.show('❌ Введите домен Filmix');
                return;
            }
            
            // Сохраняем домен
            Lampa.Storage.set('filmix_domain', domain);
            filmix_domain = domain;
            
            // Сохраняем токен если он изменен
            if (token && token !== filmix_token) {
                if (token.length < 10) {
                    Lampa.Noty.show('❌ Токен слишком короткий');
                    return;
                }
                Lampa.Storage.set('filmix_mod_token', token);
                filmix_token = token;
            }
            
            Lampa.Noty.show('✅ Настройки сохранены!');
            Lampa.Dialog.clear();
            
            // Обновляем отображение в настройках
            updateSettingsDisplay();
        }
    }

    // Добавление кнопки Filmix
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
                    if (container.length === 0) {
                        // Пробуем альтернативные контейнеры
                        container = $('.full-buttons-selector, .full-start .buttons');
                        if (container.length === 0) {
                            console.log('Filmix: Не найден контейнер для кнопок');
                            return;
                        }
                    }
                    
                    // Удаляем старую кнопку если есть
                    $('.filmix-custom-button').remove();
                    
                    // Создаем нашу кнопку
                    var btn = $(`
                        <div class="filmix-custom-button selector" 
                             style="order: 3; margin: 8px 0; padding: 12px 16px; 
                                    background: linear-gradient(135deg, rgba(255,107,0,0.2), rgba(255,107,0,0.1));
                                    border: 1px solid rgba(255,107,0,0.3); border-radius: 8px;
                                    display: flex; align-items: center; gap: 10px;
                                    cursor: pointer;">
                            <div style="width: 24px; height: 24px; background: #FF6B00; border-radius: 4px; 
                                        display: flex; align-items: center; justify-content: center;">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                                </svg>
                            </div>
                            <div style="font-weight: 600; color: #FF6B00; font-size: 15px;">Filmix</div>
                            ${!filmix_token ? '<div style="margin-left: auto; width: 8px; height: 8px; background: #ff5555; border-radius: 50%;"></div>' : ''}
                        </div>
                    `);
                    
                    // Обработчик клика
                    btn.on('hover:enter', function () {
                        var content = e.data.movie || e.data;
                        if (content) {
                            if (!filmix_token) {
                                Lampa.Dialog.confirm({
                                    title: 'Требуется авторизация',
                                    text: 'Для использования Filmix необходим PRO токен.\nХотите настроить сейчас?',
                                    accept: 'Настроить',
                                    cancel: 'Позже'
                                }, function(result) {
                                    if (result) showAuthPanel();
                                });
                                return;
                            }
                            
                            var fs = new FilmixPlugin();
                            fs.search(content);
                        }
                    });
                    
                    // Добавляем кнопку
                    container.append(btn);
                    
                    // Настраиваем порядок если есть другие кнопки
                    var buttons = container.children('.selector, .full-start__button');
                    if (buttons.length > 3) {
                        btn.css('order', '3');
                        // Переставляем порядок остальных кнопок
                        buttons.each(function(index) {
                            if ($(this).hasClass('filmix-custom-button')) return;
                            $(this).css('order', index < 2 ? index : index + 1);
                        });
                    }
                }, 500); // Увеличил задержку для стабильности
            }
        });
    }

    // Обновление отображения в настройках
    function updateSettingsDisplay() {
        $('.filmix-settings .settings-param__value').text(
            filmix_token ? 
            '✅ Авторизован (' + filmix_domain + ')' : 
            '❌ Не авторизован'
        );
    }

    // Добавление настроек Filmix в раздел "Парсер"
    function addFilmixSettings() {
        Lampa.Settings.listener.follow('open', function (e) {
            if (e.name == 'parser') { // Раздел "Парер" (с опечаткой как на вашем скриншоте)
                // Удаляем старые настройки
                $('.filmix-parser-settings').remove();
                
                var isAuthorized = filmix_token && filmix_token.length > 10;
                
                var settingsHTML = `
                    <div class="filmix-parser-settings" style="margin: 25px 0; border: 1px solid rgba(255,107,0,0.3); border-radius: 12px; padding: 20px; background: rgba(0,0,0,0.3);">
                        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 20px;">
                            <div style="width: 36px; height: 36px; background: linear-gradient(135deg, #FF6B00, #FF8C00); border-radius: 8px; display: flex; align-items: center; justify-content: center;">
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
                                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                                </svg>
                            </div>
                            <div>
                                <div style="font-size: 18px; font-weight: bold; color: #FF6B00;">Filmix PRO</div>
                                <div style="font-size: 12px; color: #aaa; margin-top: 2px;">Парсер фильмов и сериалов</div>
                            </div>
                        </div>
                        
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px;">
                            <div style="background: rgba(255,107,0,0.1); padding: 15px; border-radius: 8px;">
                                <div style="font-weight: bold; margin-bottom: 8px; color: #FF6B00;">🌐 Домен</div>
                                <div style="font-size: 14px; color: ${isAuthorized ? '#0f0' : '#ff6B00'}">
                                    ${filmix_domain}
                                </div>
                            </div>
                            
                            <div style="background: ${isAuthorized ? 'rgba(0,255,0,0.1)' : 'rgba(255,0,0,0.1)'}; padding: 15px; border-radius: 8px;">
                                <div style="font-weight: bold; margin-bottom: 8px; color: ${isAuthorized ? '#0f0' : '#f00'}">🔐 Статус</div>
                                <div style="font-size: 14px; color: ${isAuthorized ? '#0f0' : '#f00'}">
                                    ${isAuthorized ? '✅ Авторизован' : '❌ Не авторизован'}
                                </div>
                            </div>
                        </div>
                        
                        <div class="selector" data-type="button" 
                             style="padding: 14px; background: rgba(255,107,0,0.15); border-radius: 8px; 
                                    margin-bottom: 12px; border-left: 4px solid #FF6B00;">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <div style="font-weight: bold;">⚙️ Настройки авторизации</div>
                                <div style="color: #FF6B00; font-weight: bold;">→</div>
                            </div>
                        </div>
                        
                        ${isAuthorized ? `
                        <div class="selector" data-type="button" 
                             style="padding: 14px; background: rgba(255,0,0,0.1); border-radius: 8px;
                                    border-left: 4px solid #ff5555;">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <div style="font-weight: bold; color: #ff5555;">🚪 Выйти из аккаунта</div>
                                <div style="color: #ff5555; font-weight: bold;">×</div>
                            </div>
                        </div>
                        ` : ''}
                        
                        <div style="margin-top: 20px; padding: 15px; background: rgba(255,255,255,0.05); border-radius: 8px;">
                            <div style="font-size: 11px; color: #aaa; line-height: 1.4;">
                                <div style="color: #FF6B00; margin-bottom: 5px;">Доступные домены:</div>
                                <div>• filmix.my (рекомендуемый)</div>
                                <div>• filmix.ac</div>
                                <div>• filmix.live</div>
                                <div>• Или любой другой рабочий домен</div>
                            </div>
                        </div>
                    </div>
                `;
                
                var settingsElement = $(settingsHTML);
                
                // Обработчик настроек
                settingsElement.find('.selector:first').on('hover:enter', function() {
                    showAuthPanel();
                });
                
                // Обработчик выхода
                if (isAuthorized) {
                    settingsElement.find('.selector:last').on('hover:enter', function() {
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
                
                // Вставляем после TorrServer или в конец
                var torrserverElement = $('.settings-param:contains("TorrServer")');
                if (torrserverElement.length > 0) {
                    torrserverElement.after(settingsElement);
                } else {
                    $('.settings-window').append(settingsElement);
                }
            }
        });
    }

    // Инициализация плагина
    function initPlugin() {
        console.log(plugin_name + ' инициализирован для домена: ' + filmix_domain);
        
        // Добавляем стили
        if (!$('#filmix-plugin-styles').length) {
            $('head').append(`
                <style id="filmix-plugin-styles">
                    .filmix-custom-button {
                        transition: all 0.2s ease;
                    }
                    .filmix-custom-button:hover {
                        background: linear-gradient(135deg, rgba(255,107,0,0.3), rgba(255,107,0,0.2)) !important;
                        transform: translateY(-1px);
                        box-shadow: 0 4px 12px rgba(255,107,0,0.2);
                    }
                    .filmix-custom-button.selector-focus {
                        background: linear-gradient(135deg, rgba(255,107,0,0.4), rgba(255,107,0,0.3)) !important;
                        box-shadow: 0 0 0 2px rgba(255,107,0,0.6);
                    }
                </style>
            `);
        }
        
        // Запускаем после загрузки интерфейса
        setTimeout(function() {
            addFilmixButton();
            addFilmixSettings();
            
            // Проверяем наличие кнопок каждые 2 секунды на случай медленной загрузки
            var checkInterval = setInterval(function() {
                if ($('.full-start__buttons').length > 0 || $('.full-buttons-selector').length > 0) {
                    addFilmixButton(); // Принудительно добавляем кнопку
                    clearInterval(checkInterval);
                }
            }, 2000);
        }, 2000);
        
        // Очистка кеша
        setInterval(function() {
            search_cache = {};
        }, 30 * 60 * 1000);
    }

    // Запуск
    if (window.appready) {
        setTimeout(initPlugin, 2000);
    } else {
        Lampa.Events.listener.follow('app', function (e) {
            if (e.type == 'ready') {
                setTimeout(initPlugin, 2000);
            }
        });
    }
})();
