import sharp from 'sharp';
import { mkdirSync } from 'fs';

mkdirSync('public/icons', { recursive: true });

const src = 'src/assets/Transparent_DragonCandy_logo.png';

await sharp(src).resize(192, 192, { fit: 'contain', background: { r: 77, g: 217, b: 192, alpha: 1 } }).toFile('public/icons/icon-192.png');
await sharp(src).resize(512, 512, { fit: 'contain', background: { r: 77, g: 217, b: 192, alpha: 1 } }).toFile('public/icons/icon-512.png');

console.log('Icons generated: public/icons/icon-192.png, public/icons/icon-512.png');
