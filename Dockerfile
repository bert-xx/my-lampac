FROM ubuntu:22.04

# Устанавливаем системные зависимости
RUN apt-get update && apt-get install -y \
    wget \
    unzip \
    libicu-dev \
    libssl-dev \
    sed \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 1. Скачиваем Lampac
RUN wget https://github.com/immisterio/lampac/releases/latest/download/lampac-linux-x64.zip \
    && unzip lampac-linux-x64.zip \
    && rm lampac-linux-x64.zip \
    && chmod +x lampac

# 2. Скачиваем плагин bwa_rc.js прямо во время сборки
# Кладем его в корень, Lampac умеет отдавать файлы из корня
RUN wget http://bwa.to/rc -O /app/bwa_rc.js

# 3. Копируем ваш конфиг из репозитория
COPY init.conf /app/init.conf

# 4. Скрипт для подмены порта (Koyeb дает динамический порт через $PORT)
RUN echo '#!/bin/bash\n\
if [ -n "$PORT" ]; then\n\
  sed -i "s/\"listen_port\": 9118/\"listen_port\": ${PORT}/g" /app/init.conf\n\
fi\n\
./lampac' > /app/entrypoint.sh && chmod +x /app/entrypoint.sh

EXPOSE 9118
CMD ["/app/entrypoint.sh"]
