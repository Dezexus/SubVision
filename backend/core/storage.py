"""Module providing an abstraction layer strictly enforcing explicit storage operational modes."""
import os
import logging
import uuid
import shutil
import asyncio
from typing import Optional, Any, List, Dict
import aioboto3
from botocore.exceptions import ClientError

from core.config import settings

logger = logging.getLogger(__name__)

class StorageManager:
    """Manages file transfers strictly routing operations based on the configured storage_mode."""

    def __init__(self) -> None:
        self.mode = settings.storage_mode.lower()
        self.bucket_name = settings.s3_bucket
        self._bucket_checked = False
        if self.mode == "s3":
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
            'endpoint_url': settings.s3_endpoint
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
                raise

    def init_local_upload(self, upload_id: str) -> None:
        temp_dir = os.path.join(settings.cache_dir, ".temp", upload_id)
        os.makedirs(temp_dir, exist_ok=True)

    async def save_local_chunk(self, upload_id: str, part_number: int, data: bytes) -> None:
        chunk_path = os.path.join(settings.cache_dir, ".temp", upload_id, f"{part_number}.chunk")
        def _write():
            with open(chunk_path, "wb") as f:
                f.write(data)
        await asyncio.to_thread(_write)

    async def complete_local_upload(self, upload_id: str, filename: str, total_chunks: int) -> bool:
        temp_dir = os.path.join(settings.cache_dir, ".temp", upload_id)
        final_path = os.path.join(settings.cache_dir, filename)
        def _assemble():
            with open(final_path, "wb") as final_file:
                for i in range(1, total_chunks + 1):
                    chunk_path = os.path.join(temp_dir, f"{i}.chunk")
                    if os.path.exists(chunk_path):
                        with open(chunk_path, "rb") as chunk_file:
                            final_file.write(chunk_file.read())
                        os.remove(chunk_path)
            os.rmdir(temp_dir)
        try:
            await asyncio.to_thread(_assemble)
            return True
        except Exception as e:
            logger.error(f"Local assembly failed: {e}")
            return False

    async def create_multipart_upload(self, s3_key: str, content_type: str) -> Optional[str]:
        if self.mode == "local":
            upload_id = str(uuid.uuid4())
            self.init_local_upload(upload_id)
            return upload_id
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
        if self.mode == "local":
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
        if self.mode == "local":
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
        if self.mode == "local":
            try:
                target_path = os.path.join(settings.cache_dir, s3_key)
                await asyncio.to_thread(shutil.copy2, local_path, target_path)
                return True
            except Exception as e:
                logger.error(f"Local upload failed: {e}")
                return False
        try:
            async with self.session.client(**self._get_client_kwargs()) as client:
                await self._ensure_bucket(client)
                await client.upload_file(local_path, self.bucket_name, s3_key)
            return True
        except Exception as e:
            logger.error(f"Upload failed: {e}")
            return False

    async def download_file(self, s3_key: str, local_path: str) -> bool:
        if self.mode == "local":
            source_path = os.path.join(settings.cache_dir, s3_key)
            if not os.path.exists(source_path):
                return False
            try:
                await asyncio.to_thread(shutil.copy2, source_path, local_path)
                return True
            except Exception as e:
                logger.error(f"Local download failed: {e}")
                return False
        try:
            async with self.session.client(**self._get_client_kwargs()) as client:
                await self._ensure_bucket(client)
                await client.download_file(self.bucket_name, s3_key, local_path)
            return True
        except Exception as e:
            logger.error(f"Download failed: {e}")
            return False

    async def delete_file(self, s3_key: str) -> bool:
        if self.mode == "local":
            target_path = os.path.join(settings.cache_dir, s3_key)
            if os.path.exists(target_path):
                try:
                    os.remove(target_path)
                    return True
                except Exception as e:
                    logger.error(f"Local file deletion failed: {e}")
                    return False
            return True
        try:
            async with self.session.client(**self._get_client_kwargs()) as client:
                await client.delete_object(Bucket=self.bucket_name, Key=s3_key)
            return True
        except Exception as e:
            logger.error(f"S3 file deletion failed: {e}")
            return False

    async def get_presigned_url(self, s3_key: str, expiration: int = 3600) -> Optional[str]:
        if self.mode == "local":
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