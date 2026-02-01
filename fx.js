(function () {
    'use strict';

    // --- НАСТРОЙКИ PLUGIN FILMIX ---
    var filmix_token = Lampa.Storage.get('filmix_mod_token', '');
    var filmix_domain = Lampa.Storage.get('filmix_domain', 'filmix.my');
    var plugin_name = 'Filmix PRO';
    
    var search_cache = {};
    var button_added = false;

    // --- КЛАСС ДЛЯ РАБОТЫ С FILMIX ---
    function FilmixComponent(object) {
        var network = new Lampa.Reguest();
        var scroll = new Lampa.Scroll({ mask: true, over: true });
        var files = new Lampa.Explorer(object);
        var filter = new Lampa.Filter(object);
        
        var sources = {};
        var last;
        var source;
        var balanser = 'filmix';
        var initialized;
        var images = [];
        
        var filter_find = {
            season: [],
            voice: []
        };

        // --- ОСНОВНЫЕ МЕТОДЫ ---
        
        this.initialize = function() {
            var _this = this;
            this.loading(true);
            
            filter.onBack = function() {
                _this.start();
            };
            
            filter.render().find('.filter--sort span').text('Filmix');
            scroll.body().addClass('torrent-list');
            files.appendFiles(scroll.render());
            files.appendHead(filter.render());
            scroll.minus(files.render().find('.explorer__files-head'));
            scroll.body().append(Lampa.Template.get('lampac_content_loading'));
            Lampa.Controller.enable('content');
            
            this.loading(false);
            this.search();
        };

        // Поиск на Filmix
        this.search = function() {
            if (!filmix_token || filmix_token.length < 10) {
                this.showAuthRequired();
                return;
            }
            
            this.find();
        };

        this.find = function() {
            var url = this.requestParams();
            this.request(url);
        };

        this.request = function(url) {
            network.native(url, this.parse.bind(this), this.doesNotAnswer.bind(this), false, {
                dataType: 'text'
            });
        };

        // Формирование параметров запроса
        this.requestParams = function() {
            var query = [];
            query.push('title=' + encodeURIComponent(object.movie.title || object.movie.name));
            query.push('original_title=' + encodeURIComponent(object.movie.original_title || object.movie.original_name));
            query.push('year=' + ((object.movie.release_date || object.movie.first_air_date || '0000') + '').slice(0, 4));
            query.push('serial=' + (object.movie.name ? 1 : 0));
            
            return 'https://' + filmix_domain + '/api/v2/search?' + query.join('&');
        };

        // Парсинг JSON данных
        this.parseJsonDate = function(str, name) {
            try {
                var html = $('<div>' + str + '</div>');
                var elems = [];
                html.find(name).each(function() {
                    var item = $(this);
                    var data = JSON.parse(item.attr('data-json'));
                    var season = item.attr('s');
                    var episode = item.attr('e');
                    var text = item.text();
                    
                    if (episode) data.episode = parseInt(episode);
                    if (season) data.season = parseInt(season);
                    if (text) data.text = text;
                    data.active = item.hasClass('active');
                    elems.push(data);
                });
                return elems;
            } catch (e) {
                return [];
            }
        };

        // Обработка ответа от Filmix
        this.parse = function(str) {
            var json = Lampa.Arrays.decodeJson(str, {});
            
            try {
                if (json && json.length > 0) {
                    // Берем первый результат поиска
                    var post_id = json[0].post_id;
                    this.getFilmixPost(post_id);
                } else {
                    this.empty();
                }
            } catch (e) {
                this.doesNotAnswer(e);
            }
        };

        // Получение данных о фильме/сериале
        this.getFilmixPost = function(post_id) {
            var url = 'https://' + filmix_domain + '/api/v2/post/' + post_id + '?device_id=lampa&user_token=' + filmix_token;
            
            network.native(url, function(response) {
                if (response && response.status === 200 && response.json) {
                    var data = response.json();
                    
                    if (data && data.player_links) {
                        if (data.player_links.playlist && data.player_links.playlist.length > 0) {
                            this.displayFilmixSeasons(data.player_links.playlist, data.title);
                        } else if (data.player_links.movie && data.player_links.movie.length > 0) {
                            this.displayFilmixMovie(data.player_links.movie, data.title);
                        } else {
                            this.noSources();
                        }
                    } else if (data && data.error) {
                        this.handleFilmixError(data.error);
                    } else {
                        this.noData();
                    }
                } else {
                    this.serverError(response);
                }
            }.bind(this), function(error) {
                this.connectionError(error);
            }.bind(this));
        };

        // Отображение сериала
        this.displayFilmixSeasons = function(playlist, title) {
            var items = [];
            var seasonIndex = 1;
            
            playlist.forEach(function(season) {
                if (season.series && season.series.length > 0) {
                    season.series.forEach(function(episode, episodeIndex) {
                        if (episode.link) {
                            var episodeTitle = 'S' + seasonIndex.toString().padStart(2, '0') + 
                                             'E' + (episodeIndex + 1).toString().padStart(2, '0');
                            
                            if (episode.title) {
                                episodeTitle += ' - ' + episode.title;
                            }
                            
                            items.push({
                                title: episodeTitle,
                                file: episode.link,
                                episode: episodeIndex + 1,
                                season: seasonIndex
                            });
                        }
                    });
                    seasonIndex++;
                }
            });
            
            if (items.length > 0) {
                this.draw(items, {
                    onEnter: function(item, html) {
                        this.playFilmixVideo(item);
                    }.bind(this)
                });
            } else {
                this.noEpisodes();
            }
        };

        // Отображение фильма
        this.displayFilmixMovie = function(movieSources, title) {
            var items = [];
            
            movieSources.forEach(function(source, index) {
                if (source.link) {
                    var itemTitle = title || 'Filmix';
                    if (source.translation_name) {
                        itemTitle += ' (' + source.translation_name + ')';
                    }
                    
                    var item = {
                        title: itemTitle,
                        url: source.link,
                        method: 'play',
                        quality: {}
                    };
                    
                    // Добавляем качества
                    if (source.qualities && source.qualities.length > 0) {
                        source.qualities.forEach(function(quality) {
                            item.quality[quality.quality + 'p'] = quality.link;
                        });
                    }
                    
                    items.push(item);
                }
            });
            
            if (items.length > 0) {
                this.draw(items, {
                    onEnter: function(item, html) {
                        this.playFilmixVideo(item);
                    }.bind(this)
                });
            } else {
                this.noSources();
            }
        };

        // Воспроизведение видео
        this.playFilmixVideo = function(item) {
            if (item.method === 'play' && item.url) {
                var qualities = {};
                
                if (item.quality && Object.keys(item.quality).length > 0) {
                    qualities = item.quality;
                } else {
                    qualities['Источник'] = item.url;
                }
                
                Lampa.Player.play({
                    url: qualities,
                    title: item.title || object.movie.title,
                    subtitle: 'Filmix'
                });
            }
        };

        // --- ОБРАБОТКА ОШИБОК ---
        
        this.handleFilmixError = function(error) {
            if (error.code === 401) {
                this.showAuthRequired();
            } else {
                Lampa.Noty.show(plugin_name + ': ' + (error.message || 'Ошибка API'));
                this.empty();
            }
        };

        this.showAuthRequired = function() {
            scroll.clear();
            var html = Lampa.Template.get('lampac_does_not_answer', {});
            html.find('.online-empty__title').text('Требуется авторизация');
            html.find('.online-empty__time').text('Для доступа к Filmix необходим PRO токен. Настройте его в настройках плагина.');
            html.find('.online-empty__buttons').remove();
            scroll.append(html);
            this.loading(false);
        };

        this.noSources = function() {
            Lampa.Noty.show(plugin_name + ': Нет доступных источников');
            this.empty();
        };

        this.noData = function() {
            Lampa.Noty.show(plugin_name + ': Данные не получены');
            this.empty();
        };

        this.noEpisodes = function() {
            Lampa.Noty.show(plugin_name + ': Нет доступных серий');
            this.empty();
        };

        this.serverError = function(response) {
            Lampa.Noty.show(plugin_name + ': Ошибка сервера ' + (response ? response.status : ''));
            this.empty();
        };

        this.connectionError = function(error) {
            console.error('Filmix connection error:', error);
            Lampa.Noty.show(plugin_name + ': Ошибка соединения');
            this.empty();
        };

        // --- ОТРИСОВКА ИНТЕРФЕЙСА ---
        
        this.draw = function(items, params) {
            if (!items.length) return this.empty();
            
            scroll.clear();
            
            var viewed = Lampa.Storage.cache('online_view', 5000, []);
            var serial = object.movie.name ? true : false;
            
            items.forEach(function(element, index) {
                var episode_num = element.episode || index + 1;
                var voice_name = element.voice_name || 'Filmix';
                
                Lampa.Arrays.extend(element, {
                    voice_name: voice_name,
                    info: voice_name,
                    quality: '',
                    time: Lampa.Utils.secondsToTime(object.movie.runtime * 60, true)
                });
                
                var html = Lampa.Template.get('lampac_prestige_full', element);
                var loader = html.find('.online-prestige__loader');
                var image = html.find('.online-prestige__img');
                
                // Загрузка изображения
                if (object.movie.backdrop_path) {
                    var img = html.find('img')[0];
                    img.onerror = function() {
                        img.src = './img/img_broken.svg';
                    };
                    img.onload = function() {
                        image.addClass('online-prestige__img--loaded');
                        loader.remove();
                    };
                    img.src = Lampa.TMDB.image('t/p/w300' + object.movie.backdrop_path);
                    images.push(img);
                } else {
                    loader.remove();
                }
                
                html.on('hover:enter', function() {
                    if (object.movie.id) Lampa.Favorite.add('history', object.movie, 100);
                    if (params.onEnter) params.onEnter(element, html, {});
                }).on('hover:focus', function(e) {
                    last = e.target;
                    scroll.update($(e.target), true);
                });
                
                scroll.append(html);
            });
            
            Lampa.Controller.enable('content');
        };

        this.empty = function() {
            var html = Lampa.Template.get('lampac_does_not_answer', {});
            html.find('.online-empty__buttons').remove();
            html.find('.online-empty__title').text('Нет результатов');
            html.find('.online-empty__time').text('Фильм или сериал не найден на Filmix');
            scroll.clear();
            scroll.append(html);
            this.loading(false);
        };

        this.doesNotAnswer = function(er) {
            this.reset();
            var html = Lampa.Template.get('lampac_does_not_answer', {
                balanser: 'Filmix'
            });
            
            html.find('.online-empty__title').text('Ошибка соединения');
            html.find('.online-empty__time').text('Не удалось подключиться к Filmix');
            html.find('.online-empty__buttons').remove();
            
            scroll.clear();
            scroll.append(html);
            this.loading(false);
        };

        // --- УПРАВЛЕНИЕ СОСТОЯНИЕМ ---
        
        this.reset = function() {
            last = false;
            network.clear();
            this.clearImages();
            scroll.render().find('.empty').remove();
            scroll.clear();
            scroll.reset();
            scroll.body().append(Lampa.Template.get('lampac_content_loading'));
        };

        this.clearImages = function() {
            images.forEach(function(img) {
                img.onerror = function() {};
                img.onload = function() {};
                img.src = '';
            });
            images = [];
        };

        this.loading = function(status) {
            if (status) this.activity.loader(true);
            else {
                this.activity.loader(false);
                this.activity.toggle();
            }
        };

        // --- НАВИГАЦИЯ ---
        
        this.start = function() {
            if (Lampa.Activity.active().activity !== this.activity) return;
            if (!initialized) {
                initialized = true;
                this.initialize();
            }
            
            Lampa.Background.immediately(Lampa.Utils.cardImgBackgroundBlur(object.movie));
            Lampa.Controller.add('content', {
                toggle: function() {
                    Lampa.Controller.collectionSet(scroll.render(), files.render());
                    Lampa.Controller.collectionFocus(last || false, scroll.render());
                },
                gone: function() {
                    network.clear();
                },
                up: function() {
                    if (Lampa.Navigator.canmove('up')) {
                        Lampa.Navigator.move('up');
                    } else Lampa.Controller.toggle('head');
                },
                down: function() {
                    Lampa.Navigator.move('down');
                },
                right: function() {
                    if (Lampa.Navigator.canmove('right')) Lampa.Navigator.move('right');
                },
                left: function() {
                    if (Lampa.Navigator.canmove('left')) Lampa.Navigator.move('left');
                    else Lampa.Controller.toggle('menu');
                },
                back: this.back.bind(this)
            });
            Lampa.Controller.toggle('content');
        };

        this.render = function() {
            return files.render();
        };

        this.back = function() {
            Lampa.Activity.backward();
        };

        this.pause = function() {};
        this.stop = function() {};
        
        this.destroy = function() {
            network.clear();
            this.clearImages();
            files.destroy();
            scroll.destroy();
        };
    }

    // --- ПАНЕЛЬ НАСТРОЕК FILMIX ---
    
    function showFilmixSettings() {
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
                    <div style="font-size: 11px; color: #aaa; margin-top: 5px;">
                        Токен можно получить в личном кабинете Filmix после покупки PRO подписки
                    </div>
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
        
        setTimeout(function() {
            var cancelBtn = document.getElementById('filmix_settings_cancel');
            var saveBtn = document.getElementById('filmix_settings_save');
            var domainInput = document.getElementById('filmix_domain_input');
            var tokenInput = document.getElementById('filmix_token_input');
            
            if (cancelBtn) {
                cancelBtn.addEventListener('click', function() {
                    Lampa.Dialog.clear();
                });
            }
            
            if (saveBtn) {
                saveBtn.addEventListener('click', function() {
                    var domain = domainInput.value.trim().replace(/^https?:\/\//, '');
                    var token = tokenInput.value.trim();
                    
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
                        Lampa.Noty.show('✅ Настройки сохранены!');
                    } else {
                        Lampa.Storage.set('filmix_mod_token', '');
                        filmix_token = '';
                        Lampa.Noty.show('✅ Токен удален!');
                    }
                    
                    Lampa.Dialog.clear();
                });
            }
        }, 100);
    }

    // --- ДОБАВЛЕНИЕ КНОПКИ FILMIX ---
    
    function addFilmixButton() {
        if (button_added) return;
        
        Lampa.Listener.follow('full', function(e) {
            if (e.type == 'complite') {
                try {
                    var render = e.object.activity.render();
                    var torrentButton = render.find('.view--torrent');
                    
                    if (torrentButton.length && !render.find('.filmix-pro-button').length) {
                        var button = $(`
                            <div class="full-start__button selector filmix-pro-button" 
                                 style="order: 3; margin-top: 0;">
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <div style="width: 24px; height: 24px; background: #FF6B00; border-radius: 4px; 
                                                display: flex; align-items: center; justify-content: center;">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                                        </svg>
                                    </div>
                                    <span style="color: #FF6B00; font-weight: 500;">Filmix PRO</span>
                                    ${!filmix_token ? '<div style="margin-left: auto; width: 8px; height: 8px; background: #ff5555; border-radius: 50%;"></div>' : ''}
                                </div>
                            </div>
                        `);
                        
                        button.on('hover:enter', function() {
                            var movie = e.data.movie || e.data;
                            if (!movie) {
                                Lampa.Noty.show('❌ Нет данных о фильме');
                                return;
                            }
                            
                            if (!filmix_token || filmix_token.length < 10) {
                                Lampa.Dialog.confirm({
                                    title: 'Требуется авторизация',
                                    text: 'Для использования Filmix необходим PRO токен.\nХотите настроить сейчас?',
                                    accept: 'Настроить',
                                    cancel: 'Позже'
                                }, function(result) {
                                    if (result) showFilmixSettings();
                                });
                                return;
                            }
                            
                            Lampa.Activity.push({
                                url: '',
                                title: 'Filmix PRO',
                                component: 'filmix_pro',
                                movie: movie,
                                page: 1
                            });
                        });
                        
                        torrentButton.after(button);
                        button_added = true;
                    }
                } catch (err) {
                    console.error('Filmix button error:', err);
                }
            }
        });
    }

    // --- ДОБАВЛЕНИЕ НАСТРОЕК В РАЗДЕЛ "ПАРЕР" ---
    
    function addFilmixParserSettings() {
        Lampa.Settings.listener.follow('open', function (e) {
            if (e.name == 'parser') {
                try {
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
                        showFilmixSettings();
                    });
                    
                    $('.settings-window').append(settingsElement);
                } catch (err) {
                    console.error('Filmix settings error:', err);
                }
            }
        });
    }

    // --- ДОБАВЛЕНИЕ СТИЛЕЙ ---
    
    function addFilmixStyles() {
        if (!$('#filmix-pro-styles').length) {
            $('head').append(`
                <style id="filmix-pro-styles">
                    .filmix-pro-button {
                        background: rgba(255, 107, 0, 0.1) !important;
                        border: 1px solid rgba(255, 107, 0, 0.3) !important;
                    }
                    .filmix-pro-button:hover {
                        background: rgba(255, 107, 0, 0.2) !important;
                    }
                    .filmix-pro-button .selector-focus {
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

    // --- ИНИЦИАЛИЗАЦИЯ ПЛАГИНА ---
    
    function initFilmixPlugin() {
        console.log('Filmix PRO плагин инициализирован для домена: ' + filmix_domain);
        
        try {
            // Регистрация компонента
            Lampa.Component.add('filmix_pro', FilmixComponent);
            
            // Добавление стилей
            addFilmixStyles();
            
            // Добавление кнопки
            addFilmixButton();
            
            // Добавление настроек
            addFilmixParserSettings();
            
            // Очистка кеша каждые 30 минут
            setInterval(function() {
                search_cache = {};
            }, 30 * 60 * 1000);
            
        } catch (err) {
            console.error('Filmix plugin init error:', err);
        }
    }

    // --- ЗАПУСК ПЛАГИНА ---
    
    if (window.appready) {
        setTimeout(initFilmixPlugin, 2000);
    } else {
        Lampa.Events.listener.follow('app', function (e) {
            if (e.type == 'ready') {
                setTimeout(initFilmixPlugin, 2000);
            }
        });
    }

})();
