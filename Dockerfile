# Используем образ с предустановленным .NET 9 Runtime
FROM mcr.microsoft.com/dotnet/runtime:9.0

# Устанавливаем необходимые системные зависимости
RUN apt-get update && apt-get install -y \
    wget \
    unzip \
    ca-certificates \
    sed \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 1. Скачиваем актуальный релиз Lampac (теперь это publish.zip)
RUN wget --no-check-certificate https://github.com/immisterio/Lampac/releases/latest/download/publish.zip \
    && unzip publish.zip \
    && rm publish.zip \
    && chmod +x Lampac

# 2. Скачиваем ваш локальный плагин
RUN wget --no-check-certificate http://bwa.to/rc -O /app/wwwroot/bwa_rc.js || wget --no-check-certificate http://bwa.to/rc -O /app/bwa_rc.js

# 3. Копируем ваш конфиг
COPY init.conf /app/init.conf

# 4. Создаем скрипт запуска для подмены порта Koyeb
RUN echo '#!/bin/bash' > /app/entrypoint.sh && \
    echo 'if [ -n "$PORT" ]; then' >> /app/entrypoint.sh && \
    echo '  sed -i "s/\"listen_port\": 9118/\"listen_port\": ${PORT}/g" /app/init.conf' >> /app/entrypoint.sh && \
    echo 'fi' >> /app/entrypoint.sh && \
    echo 'dotnet Lampac.dll' >> /app/entrypoint.sh && \
    chmod +x /app/entrypoint.sh

# Koyeb работает через порт 8000 по умолчанию
EXPOSE 8000

CMD ["/app/entrypoint.sh"]
