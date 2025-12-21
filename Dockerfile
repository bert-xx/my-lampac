FROM ubuntu:22.04

# Устанавливаем всё необходимое сразу
RUN apt-get update && apt-get install -y \
    wget \
    unzip \
    libicu-dev \
    libssl-dev \
    ca-certificates \
    sed \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 1. Скачиваем Lampac
RUN wget --no-check-certificate https://github.com/immisterio/lampac/releases/latest/download/lampac-linux-x64.zip \
    && unzip lampac-linux-x64.zip \
    && rm lampac-linux-x64.zip \
    && chmod +x lampac

# 2. Скачиваем плагин локально
RUN wget --no-check-certificate http://bwa.to/rc -O /app/bwa_rc.js

# 3. Копируем конфиг
COPY init.conf /app/init.conf

# 4. Создаем надежный скрипт запуска
RUN echo '#!/bin/bash' > /app/entrypoint.sh && \
    echo 'if [ -n "$PORT" ]; then' >> /app/entrypoint.sh && \
    echo '  sed -i "s/\"listen_port\": 9118/\"listen_port\": ${PORT}/g" /app/init.conf' >> /app/entrypoint.sh && \
    echo 'fi' >> /app/entrypoint.sh && \
    echo './lampac' >> /app/entrypoint.sh && \
    chmod +x /app/entrypoint.sh

# Koyeb использует 8000, 8080 или динамический PORT
EXPOSE 8000

CMD ["/app/entrypoint.sh"]
