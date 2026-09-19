import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Studio product imagery, generated as SVG.
 *
 * Rather than depend on third-party image hosts (which break, rate-limit and
 * cannot be committed), the seed renders its own catalogue photography: a
 * device silhouette in the correct finish on a soft studio ground. Files land
 * in /public/products and their URLs are written to ProductImage rows, so the
 * admin can replace any of them with a real photograph without a code change.
 */

export type Silhouette = 'notch-wide' | 'notch-narrow' | 'island';
export type CameraLayout = 'single' | 'dual' | 'triple';

export interface Finish {
  /** Machine value stored on the colour attribute. */
  value: string;
  label: string;
  /** Body colour. */
  hex: string;
  /** Rim / frame colour. */
  rim: string;
  /** true for light bodies, so the screen reflection is toned down. */
  light?: boolean;
}

export const FINISHES: Record<string, Finish> = {
  black: { value: 'black', label: 'Black', hex: '#1B1B1D', rim: '#3A3A3E' },
  'space-black': { value: 'space-black', label: 'Space Black', hex: '#17171A', rim: '#34343A' },
  midnight: { value: 'midnight', label: 'Midnight', hex: '#1E2430', rim: '#3C4454' },
  graphite: { value: 'graphite', label: 'Graphite', hex: '#33322F', rim: '#57554F' },
  white: { value: 'white', label: 'White', hex: '#EFECE6', rim: '#CFCAC1', light: true },
  silver: { value: 'silver', label: 'Silver', hex: '#E3E4E6', rim: '#B9BBBE', light: true },
  starlight: { value: 'starlight', label: 'Starlight', hex: '#EFE7DA', rim: '#D2C6B4', light: true },
  blue: { value: 'blue', label: 'Blue', hex: '#3F5F86', rim: '#5E7CA1' },
  'pacific-blue': { value: 'pacific-blue', label: 'Pacific Blue', hex: '#2E4A5E', rim: '#4C6C82' },
  'sierra-blue': { value: 'sierra-blue', label: 'Sierra Blue', hex: '#8FB0CC', rim: '#A9C4D9', light: true },
  'blue-titanium': { value: 'blue-titanium', label: 'Blue Titanium', hex: '#5A6E82', rim: '#8496A8' },
  ultramarine: { value: 'ultramarine', label: 'Ultramarine', hex: '#4F5FC0', rim: '#7684D6' },
  red: { value: 'red', label: 'Red', hex: '#9E2430', rim: '#BE4450' },
  purple: { value: 'purple', label: 'Purple', hex: '#6D5E92', rim: '#8A7CAD' },
  'deep-purple': { value: 'deep-purple', label: 'Deep Purple', hex: '#4B4256', rim: '#6A6076' },
  pink: { value: 'pink', label: 'Pink', hex: '#E2C0C4', rim: '#C79FA4', light: true },
  green: { value: 'green', label: 'Green', hex: '#3B5A4B', rim: '#587A68' },
  'midnight-green': { value: 'midnight-green', label: 'Midnight Green', hex: '#33453C', rim: '#4F6459' },
  gold: { value: 'gold', label: 'Gold', hex: '#D5BC98', rim: '#B79E7C', light: true },
  'natural-titanium': { value: 'natural-titanium', label: 'Natural Titanium', hex: '#B6ACA0', rim: '#958B80', light: true },
  'black-titanium': { value: 'black-titanium', label: 'Black Titanium', hex: '#33322F', rim: '#55534E' },
  'desert-titanium': { value: 'desert-titanium', label: 'Desert Titanium', hex: '#B79B7C', rim: '#98805F' },
  coral: { value: 'coral', label: 'Coral', hex: '#E2765C', rim: '#C25C45' },
};

interface RenderOptions {
  finish: Finish;
  silhouette: Silhouette;
  camera: CameraLayout;
  /** 'front' shows the display, 'back' shows the camera module. */
  face: 'front' | 'back';
}

const W = 900;
const H = 1100;

function cameraModule(finish: Finish, layout: CameraLayout, x: number, y: number): string {
  const lensPositions: Record<CameraLayout, [number, number][]> = {
    single: [[0, 0]],
    dual: [
      [0, 0],
      [0, 96],
    ],
    triple: [
      [0, 0],
      [0, 96],
      [96, 48],
    ],
  };
  const size = layout === 'triple' ? 232 : 168;
  const positions = lensPositions[layout];

  const lenses = positions
    .map(
      ([dx, dy]) => `
      <g transform="translate(${x + 46 + dx}, ${y + 46 + dy})">
        <circle r="38" fill="url(#lensRing)" />
        <circle r="30" fill="#0B0C0E" />
        <circle r="19" fill="url(#lensGlass)" />
        <circle r="8" fill="#141821" />
        <circle cx="-7" cy="-8" r="4.5" fill="#8FB4E8" opacity="0.75" />
      </g>`,
    )
    .join('');

  return `
    <g>
      <rect x="${x}" y="${y}" width="${size}" height="${size}" rx="56"
            fill="${finish.hex}" stroke="${finish.rim}" stroke-width="2" />
      <rect x="${x}" y="${y}" width="${size}" height="${size}" rx="56" fill="url(#moduleSheen)" />
      ${lenses}
    </g>`;
}

export function renderDevice({ finish, silhouette, camera, face }: RenderOptions): string {
  const bodyX = 262;
  const bodyY = 130;
  const bodyW = 376;
  const bodyH = 800;
  const radius = silhouette === 'island' ? 62 : 56;

  const screenInset = 10;

  const notch =
    silhouette === 'island'
      ? `<rect x="${bodyX + bodyW / 2 - 62}" y="${bodyY + 40}" width="124" height="34" rx="17" fill="#08090B" />`
      : silhouette === 'notch-narrow'
        ? `<path d="M ${bodyX + bodyW / 2 - 78} ${bodyY + screenInset}
             h 156 a 16 16 0 0 1 -16 16 h -124 a 16 16 0 0 1 -16 -16 z" fill="#08090B" />`
        : `<path d="M ${bodyX + bodyW / 2 - 104} ${bodyY + screenInset}
             h 208 a 18 18 0 0 1 -18 20 h -172 a 18 18 0 0 1 -18 -20 z" fill="#08090B" />`;

  const front = `
    <rect x="${bodyX + screenInset}" y="${bodyY + screenInset}" width="${bodyW - screenInset * 2}"
          height="${bodyH - screenInset * 2}" rx="${radius - 6}" fill="url(#screen)" />
    <rect x="${bodyX + screenInset}" y="${bodyY + screenInset}" width="${bodyW - screenInset * 2}"
          height="${bodyH - screenInset * 2}" rx="${radius - 6}" fill="url(#screenSheen)" opacity="${finish.light ? 0.5 : 0.85}" />
    ${notch}
    <rect x="${bodyX + bodyW / 2 - 60}" y="${bodyY + bodyH - 40}" width="120" height="5" rx="2.5" fill="#5A5F68" opacity="0.6" />`;

  const back = `
    <rect x="${bodyX + 6}" y="${bodyY + 6}" width="${bodyW - 12}" height="${bodyH - 12}" rx="${radius - 4}"
          fill="${finish.hex}" />
    <rect x="${bodyX + 6}" y="${bodyY + 6}" width="${bodyW - 12}" height="${bodyH - 12}" rx="${radius - 4}"
          fill="url(#backSheen)" />
    ${cameraModule(finish, camera, bodyX + 40, bodyY + 40)}
    <circle cx="${bodyX + bodyW / 2}" cy="${bodyY + bodyH / 2 + 40}" r="46" fill="${finish.light ? '#00000012' : '#FFFFFF10'}" />`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img">
  <defs>
    <linearGradient id="ground" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#F7F5F1" />
      <stop offset="55%" stop-color="#EFEBE4" />
      <stop offset="100%" stop-color="#E4DFD6" />
    </linearGradient>
    <radialGradient id="spot" cx="50%" cy="34%" r="62%">
      <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.95" />
      <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0" />
    </radialGradient>
    <linearGradient id="body" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${finish.rim}" />
      <stop offset="42%" stop-color="${finish.hex}" />
      <stop offset="100%" stop-color="${finish.rim}" />
    </linearGradient>
    <linearGradient id="screen" x1="0.1" y1="0" x2="0.9" y2="1">
      <stop offset="0%" stop-color="#101318" />
      <stop offset="48%" stop-color="#05070A" />
      <stop offset="100%" stop-color="#0D1117" />
    </linearGradient>
    <linearGradient id="screenSheen" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.10" />
      <stop offset="38%" stop-color="#FFFFFF" stop-opacity="0.02" />
      <stop offset="100%" stop-color="#8CA6C8" stop-opacity="0.06" />
    </linearGradient>
    <linearGradient id="backSheen" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.16" />
      <stop offset="45%" stop-color="#FFFFFF" stop-opacity="0.02" />
      <stop offset="100%" stop-color="#000000" stop-opacity="0.10" />
    </linearGradient>
    <linearGradient id="moduleSheen" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.14" />
      <stop offset="100%" stop-color="#000000" stop-opacity="0.08" />
    </linearGradient>
    <radialGradient id="lensRing" cx="35%" cy="30%" r="80%">
      <stop offset="0%" stop-color="#6E7076" />
      <stop offset="100%" stop-color="#2A2C30" />
    </radialGradient>
    <radialGradient id="lensGlass" cx="34%" cy="28%" r="76%">
      <stop offset="0%" stop-color="#2D3A52" />
      <stop offset="100%" stop-color="#0A0D14" />
    </radialGradient>
    <filter id="drop" x="-30%" y="-20%" width="160%" height="150%">
      <feDropShadow dx="0" dy="26" stdDeviation="26" flood-color="#2A2620" flood-opacity="0.20" />
    </filter>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#ground)" />
  <rect width="${W}" height="${H}" fill="url(#spot)" />
  <ellipse cx="${W / 2}" cy="${bodyY + bodyH + 34}" rx="196" ry="24" fill="#2A2620" opacity="0.13" />

  <g filter="url(#drop)">
    <rect x="${bodyX}" y="${bodyY}" width="${bodyW}" height="${bodyH}" rx="${radius}" fill="url(#body)" />
    ${face === 'front' ? front : back}
    <rect x="${bodyX}" y="${bodyY}" width="${bodyW}" height="${bodyH}" rx="${radius}"
          fill="none" stroke="${finish.rim}" stroke-width="3" opacity="0.9" />
  </g>
</svg>`;
}

export function imageKey(silhouette: Silhouette, camera: CameraLayout, finish: string, face: 'front' | 'back') {
  return `${silhouette}-${camera}-${finish}-${face}`;
}

/**
 * Writes every requested combination to /public/products and returns a map of
 * key → public URL.
 */
export function writeDeviceImages(
  combos: { silhouette: Silhouette; camera: CameraLayout; finish: string }[],
  publicDir: string,
): Map<string, string> {
  const outDir = join(publicDir, 'products');
  mkdirSync(outDir, { recursive: true });

  const urls = new Map<string, string>();
  const seen = new Set<string>();

  for (const combo of combos) {
    const finish = FINISHES[combo.finish];
    if (!finish) continue;
    for (const face of ['front', 'back'] as const) {
      const key = imageKey(combo.silhouette, combo.camera, combo.finish, face);
      if (seen.has(key)) continue;
      seen.add(key);
      writeFileSync(
        join(outDir, `${key}.svg`),
        renderDevice({ finish, silhouette: combo.silhouette, camera: combo.camera, face }),
        'utf8',
      );
      urls.set(key, `/products/${key}.svg`);
    }
  }
  return urls;
}

/** Editorial artwork used by the homepage hero and category tiles. */
export function writeBrandArtwork(publicDir: string): void {
  const outDir = join(publicDir, 'brand');
  mkdirSync(outDir, { recursive: true });

  writeFileSync(
    join(outDir, 'hero.svg'),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 900" width="1200" height="900">
  <defs>
    <radialGradient id="g" cx="52%" cy="38%" r="70%">
      <stop offset="0%" stop-color="#2A2A2E" />
      <stop offset="60%" stop-color="#131315" />
      <stop offset="100%" stop-color="#0A0A0B" />
    </radialGradient>
    <linearGradient id="beam" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#C8A96A" stop-opacity="0.28" />
      <stop offset="100%" stop-color="#C8A96A" stop-opacity="0" />
    </linearGradient>
  </defs>
  <rect width="1200" height="900" fill="url(#g)" />
  <ellipse cx="600" cy="330" rx="520" ry="360" fill="url(#beam)" />
  <g opacity="0.5" stroke="#C8A96A" stroke-width="0.6" fill="none">
    ${Array.from({ length: 9 }, (_, i) => `<ellipse cx="600" cy="450" rx="${120 + i * 62}" ry="${86 + i * 44}" opacity="${0.5 - i * 0.05}" />`).join('')}
  </g>
</svg>`,
    'utf8',
  );

  writeFileSync(
    join(outDir, 'og.svg'),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  <rect width="1200" height="630" fill="#0B0B0C" />
  <ellipse cx="600" cy="240" rx="480" ry="300" fill="#C8A96A" opacity="0.10" />
  <text x="600" y="300" text-anchor="middle" font-family="Georgia, serif" font-size="86" fill="#F6F3ED" letter-spacing="14">AURUM</text>
  <text x="600" y="368" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="26" fill="#C8A96A" letter-spacing="6">PREMIUM iPHONES · UAE</text>
</svg>`,
    'utf8',
  );
}
