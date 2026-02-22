"""
Module providing an abstraction layer for interacting with S3-compatible object storage.
"""
import os
import logging
from typing import Optional
import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)

class StorageManager:
    """
    Manages file uploads, downloads, and presigned URL generation for S3 storage.
    Gracefully falls back to local filesystem mode if S3 is not configured.
    """

    def __init__(self) -> None:
        """
        Initializes the S3 client if endpoint is provided.
        """
        self.endpoint = os.getenv('S3_ENDPOINT')
        self.bucket_name = os.getenv('S3_BUCKET', 'subvision')
        self.s3_client = None

        if self.endpoint:
            self.s3_client = boto3.client(
                's3',
                endpoint_url=self.endpoint,
                aws_access_key_id=os.getenv('S3_ACCESS_KEY', 'minioadmin'),
                aws_secret_access_key=os.getenv('S3_SECRET_KEY', 'minioadmin'),
                region_name=os.getenv('S3_REGION', 'us-east-1')
            )
            self._ensure_bucket()
        else:
            logger.info("S3_ENDPOINT not set. Running in Local Storage Mode.")

    def _ensure_bucket(self) -> None:
        """
        Verifies the existence of the target bucket and creates it if missing.
        """
        if not self.s3_client:
            return

        try:
            self.s3_client.head_bucket(Bucket=self.bucket_name)
        except ClientError:
            try:
                self.s3_client.create_bucket(Bucket=self.bucket_name)
            except Exception as e:
                logger.error(f"Failed to create bucket: {e}")

    def upload_file(self, local_path: str, s3_key: str) -> bool:
        """
        Transfers a local file to the remote S3 bucket.
        """
        if not self.s3_client:
            return True

        try:
            self.s3_client.upload_file(local_path, self.bucket_name, s3_key)
            return True
        except Exception as e:
            logger.error(f"Upload failed: {e}")
            return False

    def download_file(self, s3_key: str, local_path: str) -> bool:
        """
        Retrieves a file from the S3 bucket to the local filesystem.
        """
        if not self.s3_client:
            return os.path.exists(local_path)

        try:
            self.s3_client.download_file(self.bucket_name, s3_key, local_path)
            return True
        except Exception as e:
            logger.error(f"Download failed: {e}")
            return False

    def get_presigned_url(self, s3_key: str, expiration: int = 3600) -> Optional[str]:
        """
        Generates a temporary access URL for secure file downloads.
        """
        if not self.s3_client:
            return None

        try:
            url = self.s3_client.generate_presigned_url(
                'get_object',
                Params={'Bucket': self.bucket_name, 'Key': s3_key},
                ExpiresIn=expiration
            )
            return url
        except Exception as e:
            logger.error(f"Presigned URL generation failed: {e}")
            return None

storage_manager = StorageManager()
