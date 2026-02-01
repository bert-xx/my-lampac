(function () {
    'use strict';

    function FilmixComponent(object) {
        var network = new Lampa.Regard();
        var scroll = new Lampa.Scroll({mask: true, over: true});
        var items = [];

        this.create = function () {
            var _this = this;
            // Поиск фильма по названию
            var searchUrl = 'https://filmix.ac/api/v2/search?text=' + encodeURIComponent(object.title);
            
            network.silent(searchUrl, function (found) {
                if (found && found.length > 0) {
                    _this.showLinks(found[0].post_id);
                } else {
                    Lampa.Noty.show('На Filmix ничего не найдено');
                }
            });
            return scroll.render();
        };

        this.showLinks = function (post_id) {
            var token = Lampa.Storage.get('filmix_token', '');
            var postUrl = 'https://filmix.ac/api/v2/post/' + post_id + (token ? '?user_token=' + token : '');
            
            network.silent(postUrl, function (data) {
                if (data && data.player_links) {
                    // Открываем стандартный выбор серий/качеств Lampa
                    Lampa.Select.show({
                        title: 'Filmix',
                        items: [{title: 'Смотреть в плеере', play: true}],
                        onSelect: function() {
                            Lampa.Player.play({
                                url: data.player_links.movie ? data.player_links.movie[0].link : '',
                                title: object.title
                            });
                        }
                    });
                }
            });
        };
    }

    // РЕГИСТРАЦИЯ КНОПКИ
    function addBtn() {
        Lampa.Listener.follow('full', function (e) {
            if (e.type == 'complite') { // Когда карточка фильма загрузилась
                var btn = $(`<div class="full-start__button selector">
                    <svg height="24" viewBox="0 0 24 24" width="24" fill="white"><path d="M10 16.5l6-4.5-6-4.5v9zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/></svg>
                    <span>Смотреть на Filmix</span>
                </div>`);

                btn.on('hover:enter', function () {
                    Lampa.Component.add('filmix_mod', FilmixComponent);
                    Lampa.Controller.main().push({
                        component: 'filmix_mod',
                        title: 'Filmix',
                        object: e.data.movie
                    });
                });

                // Вставляем кнопку в начало списка кнопок
                $('.full-start__buttons').append(btn);
            }
        });
    }

    if (window.appready) addBtn();
    else Lampa.Events.listener.follow('app', function (e) { if (e.type == 'ready') addBtn(); });
})();
