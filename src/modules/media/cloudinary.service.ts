import {
  BadGatewayException,
  Injectable,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';

export type CloudinaryUploadResult = Pick<
  UploadApiResponse,
  'public_id' | 'secure_url' | 'width' | 'height' | 'format'
> & { duration?: number };

const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/avi'];
const PHOTO_MAX_BYTES = 50 * 1024 * 1024;   // 50 MB
const VIDEO_MAX_BYTES = 500 * 1024 * 1024;  // 500 MB

@Injectable()
export class CloudinaryService {
  // ─── Upload ───────────────────────────────────────────────────────────────

  async upload(
    file: Express.Multer.File,
    studioOwnerId: string,
    galleryId: string,
    mediaType: 'photo' | 'video',
  ): Promise<CloudinaryUploadResult> {
    const allowedMimes = mediaType === 'photo' ? PHOTO_TYPES : VIDEO_TYPES;
    const maxBytes = mediaType === 'photo' ? PHOTO_MAX_BYTES : VIDEO_MAX_BYTES;

    // Validate MIME type
    if (!allowedMimes.includes(file.mimetype)) {
      throw new UnsupportedMediaTypeException(
        `MIME type "${file.mimetype}" is not supported for ${mediaType} uploads.`,
      );
    }

    // Validate file size
    if (file.size > maxBytes) {
      const limitMB = maxBytes / (1024 * 1024);
      throw new PayloadTooLargeException(
        `File size exceeds the ${limitMB} MB limit for ${mediaType} uploads.`,
      );
    }

    // Upload to Cloudinary
    try {
      const result = await new Promise<UploadApiResponse>((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: `${studioOwnerId}/${galleryId}/`,
            resource_type: 'auto',
            type: 'authenticated',
          },
          (error, result) => {
            if (error || !result) {
              reject(error ?? new Error('Unknown Cloudinary error'));
            } else {
              resolve(result);
            }
          },
        );
        uploadStream.end(file.buffer);
      });

      return {
        public_id: result.public_id,
        secure_url: result.secure_url,
        width: result.width,
        height: result.height,
        format: result.format,
        duration: result.duration,
      };
    } catch (err) {
      if (
        err instanceof UnsupportedMediaTypeException ||
        err instanceof PayloadTooLargeException
      ) {
        throw err;
      }
      throw new BadGatewayException(
        'Cloudinary upload failed. Please try again later.',
      );
    }
  }

  // ─── Generate Thumbnail URL ───────────────────────────────────────────────

  generateThumbnailUrl(publicId: string, mediaType: 'photo' | 'video'): string {
    if (mediaType === 'photo') {
      return cloudinary.url(publicId, {
        transformation: [
          { crop: 'auto', gravity: 'auto', height: 400, width: 400, fetch_format: 'auto', quality: 'auto' },
        ],
        type: 'authenticated',
        sign_url: true,
      });
    } else {
      return cloudinary.url(publicId, {
        transformation: [
          { start_offset: '0', height: 400, width: 400, crop: 'fill' },
        ],
        resource_type: 'video',
        type: 'authenticated',
        sign_url: true,
        format: 'jpg',
      });
    }
  }

  // ─── Generate Signed URL ──────────────────────────────────────────────────

  generateSignedUrl(publicId: string, mediaType: 'photo' | 'video', expiresIn: number): string {
    try {
      const expiresAt = Math.floor(Date.now() / 1000) + expiresIn;
      return cloudinary.url(publicId, {
        sign_url: true,
        type: 'authenticated',
        expires_at: expiresAt,
        resource_type: mediaType === 'photo' ? 'image' : 'video',
        ...(mediaType === 'video' ? { format: 'mp4' } : {}),
      });
    } catch (err) {
      throw new ServiceUnavailableException(
        'Failed to generate signed URL. Please try again later.',
      );
    }
  }

  generateSignedThumbnailUrl(
    publicId: string,
    mediaType: 'photo' | 'video',
    expiresIn: number,
  ): string {
    try {
      const expiresAt = Math.floor(Date.now() / 1000) + expiresIn;
      if (mediaType === 'photo') {
        return cloudinary.url(publicId, {
          transformation: [
            { crop: 'auto', gravity: 'auto', height: 400, width: 400, fetch_format: 'auto', quality: 'auto' },
          ],
          type: 'authenticated',
          sign_url: true,
          expires_at: expiresAt,
        });
      } else {
        return cloudinary.url(publicId, {
          transformation: [
            { start_offset: '0', height: 400, width: 400, crop: 'fill' },
          ],
          resource_type: 'video',
          type: 'authenticated',
          sign_url: true,
          expires_at: expiresAt,
          format: 'jpg',
        });
      }
    } catch (err) {
      throw new ServiceUnavailableException(
        'Failed to generate signed URL. Please try again later.',
      );
    }
  }

  // ─── Delete ───────────────────────────────────────────────────────────────

  async delete(publicId: string): Promise<void> {
    await cloudinary.uploader.destroy(publicId, { resource_type: 'auto' });
  }
}
