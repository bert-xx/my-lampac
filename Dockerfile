FROM mcr.microsoft.com/dotnet/runtime:9.0

# Устанавливаем системные зависимости
RUN apt-get update && apt-get install -y \
    wget \
    unzip \
    ca-certificates \
    sed \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 1. Скачиваем актуальный Lampac
# Убрали команду chmod +x Lampac, так как теперь запускаем через dotnet Lampac.dll
RUN wget --no-check-certificate https://github.com/immisterio/Lampac/releases/latest/download/publish.zip \
    && unzip publish.zip \
    && rm publish.zip

# 2. Копируем ваш локальный плагин из репозитория
# Кладем сразу в wwwroot, чтобы он был доступен по ссылке
COPY bwa_rc.js /app/wwwroot/bwa_rc.js

# 3. Копируем ваш конфиг
COPY init.conf /app/init.conf

# 4. Скрипт запуска
# Теперь он меняет порт в init.conf и запускает Лампу через dotnet
RUN echo '#!/bin/bash' > /app/entrypoint.sh && \
    echo 'if [ -n "$PORT" ]; then' >> /app/entrypoint.sh && \
    echo '  sed -i "s/\"listen_port\": 9118/\"listen_port\": ${PORT}/g" /app/init.conf' >> /app/entrypoint.sh && \
    echo 'fi' >> /app/entrypoint.sh && \
    echo 'dotnet Lampac.dll' >> /app/entrypoint.sh && \
    chmod +x /app/entrypoint.sh

# Koyeb обычно использует 8000
EXPOSE 8000

CMD ["/app/entrypoint.sh"]
