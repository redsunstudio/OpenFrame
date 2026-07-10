#!/usr/bin/env python3
"""KreatorKit nightly maintenance (Railway cron service).

1. pg_dump the platform database -> gzip -> B2 (backups/postgres/…), keep 30 days.
2. Abort unfinished multipart uploads older than 7 days (they bill silently).

Env (Railway): DATABASE_URL, R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
R2_BUCKET_NAME. Runs, prints a summary, exits — cron semantics.
"""
import datetime
import gzip
import io
import os
import subprocess
import sys

import boto3

BUCKET = os.environ["R2_BUCKET_NAME"]
PREFIX = "backups/postgres/"
KEEP_DAYS = 30
MULTIPART_MAX_AGE_DAYS = 7


def s3():
    return boto3.client(
        "s3",
        endpoint_url=os.environ["R2_ENDPOINT"],
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )


def dump_database() -> bytes:
    out = subprocess.run(
        ["pg_dump", "--no-owner", "--no-privileges", os.environ["DATABASE_URL"]],
        capture_output=True,
        check=True,
    )
    buf = io.BytesIO()
    with gzip.GzipFile(fileobj=buf, mode="wb") as gz:
        gz.write(out.stdout)
    return buf.getvalue()


def main() -> int:
    client = s3()
    now = datetime.datetime.now(datetime.timezone.utc)

    # 1. nightly dump
    data = dump_database()
    key = f"{PREFIX}kreatorkit-{now:%Y-%m-%d}.sql.gz"
    client.put_object(Bucket=BUCKET, Key=key, Body=data, ContentType="application/gzip")
    print(f"backup: {key} ({len(data)} bytes)")

    # prune dumps past retention
    pruned = 0
    resp = client.list_objects_v2(Bucket=BUCKET, Prefix=PREFIX)
    for obj in resp.get("Contents", []):
        if (now - obj["LastModified"]).days > KEEP_DAYS:
            client.delete_object(Bucket=BUCKET, Key=obj["Key"])
            pruned += 1
    print(f"pruned {pruned} dumps older than {KEEP_DAYS}d")

    # 2. abort stale multipart uploads (abandoned parts are billed)
    aborted = 0
    mp = client.list_multipart_uploads(Bucket=BUCKET)
    for up in mp.get("Uploads", []):
        age = (now - up["Initiated"]).days
        if age >= MULTIPART_MAX_AGE_DAYS:
            client.abort_multipart_upload(
                Bucket=BUCKET, Key=up["Key"], UploadId=up["UploadId"]
            )
            aborted += 1
            print(f"aborted stale multipart: {up['Key']} (age {age}d)")
    print(f"aborted {aborted} stale multipart uploads")
    return 0


if __name__ == "__main__":
    sys.exit(main())
