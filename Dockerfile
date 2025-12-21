FROM mcr.microsoft.com/dotnet/aspnet:9.0

# Устанавливаем wget и unzip, чтобы скачать приложение
RUN apt-get update && apt-get install -y \
    wget \
    unzip \
    ca-certificates \
    sed \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 1. Скачиваем актуальный Lampac
RUN wget --no-check-certificate https://github.com/immisterio/Lampac/releases/latest/download/publish.zip \
    && unzip publish.zip \
    && rm publish.zip

# 2. Копируем ваш локальный плагин в папку статики
# Если папки wwwroot нет, создаем её
RUN mkdir -p /app/wwwroot
COPY bwa_rc.js /app/wwwroot/bwa_rc.js

# 3. Копируем ваш конфиг
COPY init.conf /app/init.conf

# 4. Скрипт запуска
# Важно: Koyeb передает порт в переменной $PORT. 
# Мы меняем порт в init.conf, чтобы Lampac слушал именно его.
RUN echo '#!/bin/bash' > /app/entrypoint.sh && \
    echo 'if [ -n "$PORT" ]; then' >> /app/entrypoint.sh && \
    echo '  sed -i "s/\"listen_port\": 9118/\"listen_port\": ${PORT}/g" /app/init.conf' >> /app/entrypoint.sh && \
    echo 'fi' >> /app/entrypoint.sh && \
    echo 'dotnet Lampac.dll' >> /app/entrypoint.sh && \
    chmod +x /app/entrypoint.sh

# Koyeb использует порт 8000 в настройках по умолчанию, наш скрипт подставит его
EXPOSE 8000

CMD ["/app/entrypoint.sh"]
