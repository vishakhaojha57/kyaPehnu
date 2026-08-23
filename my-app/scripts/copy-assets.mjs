import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sourceDir = 'C:\\Users\\visha\\.gemini\\antigravity-ide\\brain\\89667410-e944-493c-98d4-2f9efea08e0a';
const publicDir = path.resolve(__dirname, '../public');

const iconSrc = path.join(sourceDir, 'kyapehnu_app_icon_1785732550158.png');
const mobileMockupSrc = path.join(sourceDir, 'kyapehnu_mobile_mockup_1785732565402.png');
const tabletMockupSrc = path.join(sourceDir, 'kyapehnu_tablet_mockup_1785732593801.png');
const desktopMockupSrc = path.join(sourceDir, 'kyapehnu_desktop_mockup_1785732580105.png');

console.log('Copying assets from', sourceDir, 'to', publicDir);

if (fs.existsSync(iconSrc)) {
  fs.copyFileSync(iconSrc, path.join(publicDir, 'icon-512x512.png'));
  fs.copyFileSync(iconSrc, path.join(publicDir, 'icon-384x384.png'));
  fs.copyFileSync(iconSrc, path.join(publicDir, 'icon-192x192.png'));
  fs.copyFileSync(iconSrc, path.join(publicDir, 'apple-touch-icon.png'));
  fs.copyFileSync(iconSrc, path.join(publicDir, 'app-logo.png'));
  console.log('✔ Copied app icons (192, 384, 512, apple-touch-icon, app-logo)');
} else {
  console.error('Icon file not found:', iconSrc);
}

if (fs.existsSync(mobileMockupSrc)) {
  fs.copyFileSync(mobileMockupSrc, path.join(publicDir, 'screenshot-mobile.png'));
  console.log('✔ Copied screenshot-mobile.png');
}

if (fs.existsSync(tabletMockupSrc)) {
  fs.copyFileSync(tabletMockupSrc, path.join(publicDir, 'screenshot-tablet.png'));
  console.log('✔ Copied screenshot-tablet.png');
}

if (fs.existsSync(desktopMockupSrc)) {
  fs.copyFileSync(desktopMockupSrc, path.join(publicDir, 'screenshot-desktop.png'));
  console.log('✔ Copied screenshot-desktop.png');
}

console.log('Done copying PWA assets.');
