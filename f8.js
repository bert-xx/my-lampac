(function () {
    'use strict';

    // --- НАСТРОЙКИ ---
    var filmix_token = Lampa.Storage.get('filmix_mod_token', '');
    var filmix_domain = Lampa.Storage.get('filmix_domain', 'filmix.my');
    var plugin_name = 'Filmix Mod';
    
    var search_cache = {};
    var button_added = false;

    function FilmixPlugin() {
        var network = new Lampa.Reguest();
        
        this.getApiDomain = function() {
            return filmix_domain.replace(/^https?:\/\//, '');
        };

        this.search = function (object) {
            var _this = this;
            var search_title = object.title || object.name;
            var year = object.year ? ' ' + object.year : '';
            var search_query = encodeURIComponent(search_title + year);
            
            var cache_key = search_query.toLowerCase();
            if (search_cache[cache_key]) {
                setTimeout(function() {
                    _this.getPost(search_cache[cache_key], object);
                }, 100);
                return;
            }
            
            var domain = _this.getApiDomain();
            var url = 'https://' + domain + '/api/v2/search?text=' + search_query;
            
            network.native(url, function (response) {
                if (response && response.status === 200 && response.json) {
                    var data = response.json();
                    if (data && data.length > 0) {
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

        this.getPost = function (post_id, object) {
            var token_param = filmix_token ? '&user_token=' + filmix_token : '';
            var domain = this.getApiDomain();
            var url = 'https://' + domain + '/api/v2/post/' + post_id + '?device_id=lampa' + token_param;
            
            network.native(url, function (response) {
                if (response && response.status === 200 && response.json) {
                    var data = response.json();
                    
                    if (data && data.player_links) {
                        if (data.player_links.playlist && data.player_links.playlist.length > 0) {
                            _this.showSeasons(data.player_links.playlist, object, data.title || object.title);
                        } else if (data.player_links.movie && data.player_links.movie.length > 0) {
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

        this.playMovie = function (sources, object) {
            if (!sources || sources.length === 0) {
                Lampa.Noty.show(plugin_name + ': Нет видео источников');
                return;
            }
            
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

        this.showAuthDialog = function () {
            Lampa.Dialog.confirm({
                title: plugin_name + ' - Авторизация',
                text: 'Для доступа к Filmix требуется PRO аккаунт.\nХотите настроить сейчас?',
                accept: 'Настроить',
                cancel: 'Позже'
            }, function (result) {
                if (result) {
                    showAuthPanel();
                }
            });
        };
    }

    // Панель настроек
    function showAuthPanel() {
        var html = `
            <div style="padding: 20px; max-width: 600px;">
                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 20px;">
                    <div style="width: 36px; height: 36px; background: linear-gradient(135deg, #FF6B00, #FF8C00); border-radius: 8px; display: flex; align-items: center; justify-content: center;">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                        </svg>
                    </div>
                    <div style="font-size: 20px; font-weight: bold; color: #FF6B00;">Настройки Filmix</div>
                </div>
                
                <div style="margin-bottom: 20px;">
                    <div style="font-weight: bold; margin-bottom: 8px; color: #FF6B00;">🌐 Домен Filmix</div>
                    <div style="display: flex; gap: 10px; margin-bottom: 15px;">
                        <input type="text" id="filmix_domain_input" 
                               value="${filmix_domain}"
                               placeholder="filmix.my"
                               style="flex: 1; padding: 10px; background: rgba(255,255,255,0.1); 
                                      border: 1px solid #666; border-radius: 6px; color: white;">
                    </div>
                </div>
                
                <div style="margin-bottom: 20px;">
                    <div style="font-weight: bold; margin-bottom: 8px; color: #0096FF;">🔑 Токен авторизации</div>
                    <textarea id="filmix_token_input" 
                              placeholder="Вставьте ваш User Token здесь..." 
                              style="width: 100%; height: 80px; padding: 10px;
                                     background: rgba(255,255,255,0.1); border: 1px solid #666;
                                     border-radius: 6px; color: white; font-family: monospace; font-size: 12px;">${filmix_token || ''}</textarea>
                </div>
                
                <div style="background: rgba(255,255,255,0.05); padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                    <div style="font-weight: bold; margin-bottom: 10px; color: #FFD700;">ℹ️ Инструкция:</div>
                    <div style="font-size: 12px; line-height: 1.4;">
                        1. Введите домен Filmix (например: filmix.my, filmix.ac)<br>
                        2. Зарегистрируйтесь на этом домене<br>
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
        
        // Обработчики кнопок
        $('#filmix_settings_cancel').on('click', function() {
            Lampa.Dialog.clear();
        });
        
        $('#filmix_settings_save').on('click', function() {
            var domain = $('#filmix_domain_input').val().trim().replace(/^https?:\/\//, '');
            var token = $('#filmix_token_input').val().trim();
            
            if (!domain) {
                Lampa.Noty.show('❌ Введите домен Filmix');
                return;
            }
            
            Lampa.Storage.set('filmix_domain', domain);
            filmix_domain = domain;
            
            if (token) {
                if (token.length < 10) {
                    Lampa.Noty.show('❌ Токен слишком короткий');
                    return;
                }
                Lampa.Storage.set('filmix_mod_token', token);
                filmix_token = token;
            }
            
            Lampa.Noty.show('✅ Настройки сохранены!');
            Lampa.Dialog.clear();
        });
    }

    // Добавление кнопки по примеру Lampac
    function addFilmixButton() {
        if (button_added) return;
        
        Lampa.Listener.follow('full', function(e) {
            if (e.type == 'complite') {
                var render = e.object.activity.render();
                var torrentButton = render.find('.view--torrent');
                
                if (torrentButton.length && !render.find('.filmix--button').length) {
                    var button = $(`
                        <div class="full-start__button selector filmix--button" 
                             style="order: 3; margin-top: 0;">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <div style="width: 24px; height: 24px; background: #FF6B00; border-radius: 4px; 
                                            display: flex; align-items: center; justify-content: center;">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                                    </svg>
                                </div>
                                <span style="color: #FF6B00; font-weight: 500;">Filmix</span>
                            </div>
                        </div>
                    `);
                    
                    button.on('hover:enter', function() {
                        var movie = e.data.movie || e.data;
                        if (!movie) return;
                        
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
                        fs.search(movie);
                    });
                    
                    torrentButton.after(button);
                    button_added = true;
                    
                    // Настраиваем порядок кнопок
                    var buttons = render.find('.full-start__buttons').children();
                    buttons.each(function(index) {
                        var btn = $(this);
                        if (btn.hasClass('view--torrent')) btn.css('order', '1');
                        else if (btn.hasClass('filmix--button')) btn.css('order', '3');
                        else if (index > 1) btn.css('order', index + 2);
                    });
                }
            }
        });
    }

    // Добавление настроек в раздел "Парер"
    function addFilmixSettings() {
        Lampa.Settings.listener.follow('open', function (e) {
            if (e.name == 'parser') {
                $('.filmix-parser-settings').remove();
                
                var isAuthorized = filmix_token && filmix_token.length > 10;
                
                var settingsHTML = `
                    <div class="filmix-parser-settings selector" 
                         style="margin: 20px 0; padding: 20px; background: rgba(0,0,0,0.3); 
                                border-radius: 12px; border: 1px solid rgba(255,107,0,0.3);">
                        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 15px;">
                            <div style="width: 36px; height: 36px; background: linear-gradient(135deg, #FF6B00, #FF8C00); border-radius: 8px; display: flex; align-items: center; justify-content: center;">
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
                                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                                </svg>
                            </div>
                            <div>
                                <div style="font-size: 18px; font-weight: bold; color: #FF6B00;">Filmix PRO</div>
                                <div style="font-size: 12px; color: #aaa; margin-top: 2px;">
                                    ${filmix_domain} | ${isAuthorized ? '✅ Авторизован' : '❌ Не авторизован'}
                                </div>
                            </div>
                        </div>
                        
                        <div style="color: #ccc; font-size: 14px; margin-top: 10px;">
                            Настройки авторизации и домена Filmix
                        </div>
                    </div>
                `;
                
                var settingsElement = $(settingsHTML);
                
                settingsElement.on('hover:enter', function() {
                    showAuthPanel();
                });
                
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

    // Добавление стилей
    function addStyles() {
        if (!$('#filmix-styles').length) {
            $('head').append(`
                <style id="filmix-styles">
                    .filmix--button {
                        background: rgba(255, 107, 0, 0.1) !important;
                        border: 1px solid rgba(255, 107, 0, 0.3) !important;
                    }
                    .filmix--button:hover {
                        background: rgba(255, 107, 0, 0.2) !important;
                    }
                    .filmix--button .selector-focus {
                        background: rgba(255, 107, 0, 0.3) !important;
                        box-shadow: 0 0 0 2px rgba(255, 107, 0, 0.5);
                    }
                    .filmix-parser-settings:hover {
                        background: rgba(255, 107, 0, 0.1) !important;
                    }
                </style>
            `);
        }
    }

    // Инициализация плагина
    function initPlugin() {
        console.log('Filmix Mod инициализирован для домена: ' + filmix_domain);
        
        addStyles();
        addFilmixButton();
        addFilmixSettings();
        
        // Периодическая очистка кеша
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
