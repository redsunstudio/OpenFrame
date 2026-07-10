# KreatorKit nightly maintenance cron (pg_dump -> B2 + stale-multipart cleanup)
# postgres:17 base so pg_dump handles a v16 or v17 server.
FROM postgres:17-alpine
RUN apk add --no-cache python3 py3-pip && pip install --no-cache-dir --break-system-packages boto3
WORKDIR /app
COPY backup.py .
ENTRYPOINT []
CMD ["python3", "backup.py"]
