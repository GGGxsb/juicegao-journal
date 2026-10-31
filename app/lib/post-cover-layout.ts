import { resumeImageUrl } from './resume-image';

export interface CoverSize { width: number; height: number }
export type PostCoverLayout = 'landscape' | 'portrait' | 'text';

export function validCoverSize(size?: CoverSize | null): size is CoverSize {
  return Boolean(size && Number.isInteger(size.width) && Number.isInteger(size.height)
    && size.width > 0 && size.height > 0 && size.width <= 100_000 && size.height <= 100_000);
}

export function postCoverLayout(src: string, size?: CoverSize): PostCoverLayout {
  if (!resumeImageUrl(src)) return 'text';
  return validCoverSize(size) && size.width / size.height < .9 ? 'portrait' : 'landscape';
}

/** Reserve a useful image area even for a panorama, a square or unknown external dimensions. */
export function postCoverRatio(size?: CoverSize): number {
  return validCoverSize(size) ? Math.min(2.4, Math.max(4 / 3, size.width / size.height)) : 16 / 9;
}
