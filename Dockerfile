
FROM mcr.microsoft.com/dotnet/aspnet:9.0


RUN apt-get update && apt-get install -y \
    wget \
    unzip \
    ca-certificates \
    libicu-dev \
    libssl-dev \
    sed \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 1. Скачиваем Lampac (как в install.sh)
RUN wget --no-check-certificate https://github.com/immisterio/Lampac/releases/latest/download/publish.zip \
    && unzip -o publish.zip \
    && rm publish.zip

# 2. Подготовка плагинов и конфига
# Создаем структуру папок, которую Lampac ожидает в новых версиях
RUN mkdir -p /app/wwwroot /app/_huyampa_
COPY bwa_rc.js /app/wwwroot/bwa_rc.js
COPY init.conf /app/init.conf

# 3. Скрипт запуска (Koyeb передает порт в $PORT)
# Мы заменяем порт 9118 на тот, что выдаст Koyeb
RUN echo '#!/bin/bash' > /app/entrypoint.sh && \
    echo 'if [ -n "$PORT" ]; then' >> /app/entrypoint.sh && \
    echo '  sed -i "s/\"listen_port\": 9118/\"listen_port\": ${PORT}/g" /app/init.conf' >> /app/entrypoint.sh && \
    echo 'fi' >> /app/entrypoint.sh && \
    echo 'dotnet Lampac.dll' >> /app/entrypoint.sh && \
    chmod +x /app/entrypoint.sh

# Koyeb использует 8000 по умолчанию, наш скрипт подставит его в конфиг
EXPOSE 8000

CMD ["/app/entrypoint.sh"]
