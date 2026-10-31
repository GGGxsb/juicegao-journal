import { imageSize } from 'image-size';
import { eq, inArray } from 'drizzle-orm';
import { getDb } from '@/db';
import { media } from '@/db/schema';
import { env } from './platform';
import { validCoverSize, type CoverSize } from './post-cover-layout';

/** Only inspect headers; do not decode, resize, or modify uploaded image pixels. */
export function readImageDimensions(bytes: Uint8Array): CoverSize | null {
  try {
    const { width, height, orientation, type } = imageSize(bytes);
    if (!['png', 'jpg', 'webp', 'gif'].includes(type ?? '')) return null;
    // Browsers apply JPEG EXIF rotation before displaying a photograph.
    const size = orientation && orientation >= 5 && orientation <= 8
      ? { width: height, height: width } : { width, height };
    return validCoverSize(size) ? size : null;
  } catch { return null; }
}

function localMediaKey(src: string): string | null {
  return /^\/media\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.(?:png|jpg|webp|gif))(?:[?#].*)?$/.exec(src)?.[1] ?? null;
}

/** Add read-only cover metadata to listings; external addresses are never fetched by the server. */
export async function withCoverDimensions<T extends { coverImage: string }>(items: T[]): Promise<(T & { coverSize?: CoverSize })[]> {
  const keys = [...new Set(items.flatMap(item => { const key = localMediaKey(item.coverImage); return key ? [key] : []; }))];
  if (!keys.length) return items;
  const db = getDb();
  const rows = await db.select({ key: media.key, width: media.width, height: media.height }).from(media).where(inArray(media.key, keys));
  const sizes = new Map<string, CoverSize>();
  // Older files are inspected once, at most three at a time; subsequent visits only read SQL.
  for (let index = 0; index < rows.length; index += 3) {
    await Promise.all(rows.slice(index, index + 3).map(async row => {
      let width = row.width, height = row.height;
      if (width === null || height === null) {
        try {
          const object = await env.BUCKET.get(row.key);
          if (!object) return;
          const size = readImageDimensions(object.body);
          width = size?.width ?? 0; height = size?.height ?? 0;
          await db.update(media).set({ width, height }).where(eq(media.key, row.key));
        } catch { return; } // A missing or unavailable old image must not break the article list.
      }
      const size = { width, height };
      if (validCoverSize(size)) sizes.set(row.key, size);
    }));
  }
  return items.map(item => {
    const size = sizes.get(localMediaKey(item.coverImage) ?? '');
    return size ? { ...item, coverSize: size } : item;
  });
}
