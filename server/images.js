// Product photos uploaded from the admin panel. Each upload is resized, turned
// into .webp (transparency kept for cut-outs) and stored in the database, so the
// shop needs no separate file storage. URLs never change: /img/<uuid>.webp
import multer from 'multer';
import sharp from 'sharp';

const MAX_BYTES = 12 * 1024 * 1024;

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (req, file, cb) => cb(null, /^image\/(jpeg|png|webp|avif|heic|heif|gif)$/.test(file.mimetype)),
});

export async function saveImage(db, buffer, { maxSize = 1400 } = {}) {
  const img = sharp(buffer, { failOn: 'error' }).rotate(); // apply phone EXIF rotation
  const out = await img
    .resize({ width: maxSize, height: maxSize, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82, alphaQuality: 90, effort: 4 })
    .toBuffer({ resolveWithObject: true });
  const { rows } = await db.query(
    'INSERT INTO images (mime, bytes, width, height) VALUES ($1, $2, $3, $4) RETURNING id',
    ['image/webp', out.data, out.info.width, out.info.height]);
  return { url: `/img/${rows[0].id}.webp`, width: out.info.width, height: out.info.height };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function serveImage(db) {
  return async (req, res, next) => {
    const id = req.params.id;
    if (!UUID.test(id)) return next();
    const { rows } = await db.query('SELECT mime, bytes FROM images WHERE id = $1', [id]);
    if (!rows.length) return next();
    res.set('Content-Type', rows[0].mime);
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(rows[0].bytes);
  };
}
