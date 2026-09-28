from functools import lru_cache

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

from ..config import get_settings


@lru_cache
def get_s3_client():
    settings = get_settings()
    return boto3.client(
        "s3",
        endpoint_url=settings.s3_endpoint_url,
        region_name=settings.s3_region,
        aws_access_key_id=settings.s3_access_key_id,
        aws_secret_access_key=settings.s3_secret_access_key,
        config=Config(signature_version="s3v4"),
    )


def ensure_bucket() -> None:
    """Create the local MinIO bucket; production R2 buckets are pre-provisioned."""
    settings = get_settings()
    client = get_s3_client()
    try:
        client.head_bucket(Bucket=settings.s3_bucket)
    except ClientError:
        if settings.is_production:
            raise
        client.create_bucket(Bucket=settings.s3_bucket)

