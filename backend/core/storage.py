"""
Module providing an abstraction layer for interacting with S3-compatible object storage asynchronously.
"""
import os
import logging
from typing import Optional, Any
import aioboto3
from botocore.exceptions import ClientError

from core.config import settings

logger = logging.getLogger(__name__)

class StorageManager:
    """
    Manages file uploads, downloads, and presigned URL generation for S3 storage using async operations.
    """

    def __init__(self) -> None:
        self.endpoint = settings.s3_endpoint
        self.bucket_name = settings.s3_bucket
        self._bucket_checked = False

        if self.endpoint:
            self.session = aioboto3.Session(
                aws_access_key_id=settings.s3_access_key,
                aws_secret_access_key=settings.s3_secret_key,
                region_name=settings.s3_region
            )
        else:
            self.session = None

    def _get_client_kwargs(self) -> dict:
        """
        Returns a dictionary of connection parameters for the S3 client.
        """
        return {
            'service_name': 's3',
            'endpoint_url': self.endpoint
        }

    async def _ensure_bucket(self, client: Any) -> None:
        """
        Verifies the existence of the target bucket and creates it if missing.
        """
        if self._bucket_checked:
            return

        try:
            await client.head_bucket(Bucket=self.bucket_name)
            self._bucket_checked = True
        except ClientError:
            try:
                await client.create_bucket(Bucket=self.bucket_name)
                self._bucket_checked = True
            except Exception as e:
                logger.error(f"Failed to create bucket: {e}")

    async def upload_file(self, local_path: str, s3_key: str) -> bool:
        """
        Transfers a local file to the remote S3 bucket asynchronously.
        """
        if not self.session:
            return True

        try:
            async with self.session.client(**self._get_client_kwargs()) as client:
                await self._ensure_bucket(client)
                await client.upload_file(local_path, self.bucket_name, s3_key)
            return True
        except Exception as e:
            logger.error(f"Upload failed: {e}")
            return False

    async def download_file(self, s3_key: str, local_path: str) -> bool:
        """
        Retrieves a file from the S3 bucket to the local filesystem asynchronously.
        """
        if not self.session:
            return os.path.exists(local_path)

        try:
            async with self.session.client(**self._get_client_kwargs()) as client:
                await self._ensure_bucket(client)
                await client.download_file(self.bucket_name, s3_key, local_path)
            return True
        except Exception as e:
            logger.error(f"Download failed: {e}")
            return False

    async def get_presigned_url(self, s3_key: str, expiration: int = 3600) -> Optional[str]:
        """
        Generates a temporary access URL for secure file downloads asynchronously.
        """
        if not self.session:
            return None

        try:
            async with self.session.client(**self._get_client_kwargs()) as client:
                url = await client.generate_presigned_url(
                    'get_object',
                    Params={'Bucket': self.bucket_name, 'Key': s3_key},
                    ExpiresIn=expiration
                )
            return url
        except Exception as e:
            logger.error(f"Presigned URL generation failed: {e}")
            return None

storage_manager = StorageManager()
