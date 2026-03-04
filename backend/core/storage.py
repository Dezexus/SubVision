"""
Module providing an abstraction layer for interacting with S3-compatible object storage asynchronously.
"""
import os
import logging
from typing import Optional, Any, List, Dict
import aioboto3
from botocore.exceptions import ClientError

from core.config import settings

logger = logging.getLogger(__name__)


class StorageManager:
    """
    Manages file uploads, direct S3 multipart operations, downloads, and presigned URLs.
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
        return {
            'service_name': 's3',
            'endpoint_url': self.endpoint
        }

    async def _ensure_bucket(self, client: Any) -> None:
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

    async def create_multipart_upload(self, s3_key: str, content_type: str) -> Optional[str]:
        """
        Initializes a direct S3 multipart upload session.
        """
        if not self.session:
            return None
        try:
            async with self.session.client(**self._get_client_kwargs()) as client:
                await self._ensure_bucket(client)
                response = await client.create_multipart_upload(
                    Bucket=self.bucket_name,
                    Key=s3_key,
                    ContentType=content_type
                )
                return response.get("UploadId")
        except Exception as e:
            logger.error(f"Multipart upload init failed: {e}")
            return None

    async def get_presigned_upload_part(self, s3_key: str, upload_id: str, part_number: int) -> Optional[str]:
        """
        Generates a presigned URL for a client to upload a specific chunk directly to S3.
        """
        if not self.session:
            return None
        try:
            async with self.session.client(**self._get_client_kwargs()) as client:
                return await client.generate_presigned_url(
                    'upload_part',
                    Params={
                        'Bucket': self.bucket_name,
                        'Key': s3_key,
                        'UploadId': upload_id,
                        'PartNumber': part_number
                    },
                    ExpiresIn=3600
                )
        except Exception as e:
            logger.error(f"Presigned part URL generation failed: {e}")
            return None

    async def complete_multipart_upload(self, s3_key: str, upload_id: str, parts: List[Dict[str, Any]]) -> bool:
        """
        Finalizes the multipart upload in S3 using the ETags provided by the client.
        """
        if not self.session:
            return False
        try:
            async with self.session.client(**self._get_client_kwargs()) as client:
                await client.complete_multipart_upload(
                    Bucket=self.bucket_name,
                    Key=s3_key,
                    UploadId=upload_id,
                    MultipartUpload={'Parts': parts}
                )
                return True
        except Exception as e:
            logger.error(f"Multipart upload completion failed: {e}")
            return False

    async def upload_file(self, local_path: str, s3_key: str) -> bool:
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
