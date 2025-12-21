FROM mcr.microsoft.com/dotnet/runtime:9.0

RUN apt-get update && apt-get install -y \
    wget \
    unzip \
    ca-certificates \
    sed \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 1. Скачиваем Lampac
RUN wget --no-check-certificate https://github.com/immisterio/Lampac/releases/latest/download/publish.zip \
    && unzip publish.zip \
    && rm publish.zip \
    && chmod +x Lampac

# 2. КОПИРУЕМ плагин из вашего репозитория внутрь контейнера
# Мы кладем его в папку wwwroot, чтобы Lampac мог отдать его как статический файл
COPY bwa_rc.js /app/wwwroot/bwa_rc.js

# 3. Копируем ваш конфиг
COPY init.conf /app/init.conf

# 4. Скрипт запуска
RUN echo '#!/bin/bash' > /app/entrypoint.sh && \
    echo 'if [ -n "$PORT" ]; then' >> /app/entrypoint.sh && \
    echo '  sed -i "s/\"listen_port\": 9118/\"listen_port\": ${PORT}/g" /app/init.conf' >> /app/entrypoint.sh && \
    echo 'fi' >> /app/entrypoint.sh && \
    echo 'dotnet Lampac.dll' >> /app/entrypoint.sh && \
    chmod +x /app/entrypoint.sh

EXPOSE 8000
CMD ["/app/entrypoint.sh"]
