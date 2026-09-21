"""S3 / MinIO access for the worker."""

from functools import lru_cache
from pathlib import Path

import boto3
from botocore.config import Config

from analyzer.config import get_settings


@lru_cache(maxsize=1)
def client():
    s = get_settings()
    return boto3.client(
        "s3",
        endpoint_url=s.s3_endpoint or None,
        region_name=s.s3_region,
        aws_access_key_id=s.s3_access_key_id,
        aws_secret_access_key=s.s3_secret_access_key,
        config=Config(s3={"addressing_style": "path" if s.s3_force_path_style else "auto"}),
    )


def download(key: str, dest: Path) -> Path:
    client().download_file(get_settings().s3_bucket, key, str(dest))
    return dest


def upload_bytes(key: str, data: bytes, content_type: str) -> str:
    client().put_object(
        Bucket=get_settings().s3_bucket, Key=key, Body=data, ContentType=content_type
    )
    return key
