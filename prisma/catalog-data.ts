import type { CameraLayout, Silhouette } from './product-images';

/**
 * Seed catalogue.
 *
 * This is DATA, not code. It is loaded once by the seeder and can be replaced,
 * extended or deleted entirely from the admin afterwards. The prices below are
 * the merchant's opening price list in AED; nothing in the application reads
 * this file at runtime.
 */

export interface SeedStorage {
  value: string;
  label: string;
  /** Major-unit AED. */
  price: number;
  /** Optional "was" price, for products on promotion. */
  compareAt?: number;
}

export interface SeedProduct {
  name: string;
  seriesSlug: string;
  model: string;
  silhouette: Silhouette;
  camera: CameraLayout;
  colors: string[];
  storages: SeedStorage[];
  displaySize: string;
  chip: string;
  cameraSpec: string;
  battery: string;
  connectivity: string;
  shortDescription: string;
  description: string;
  featured?: boolean;
  bestseller?: boolean;
  newArrival?: boolean;
}

export const SERIES: { slug: string; name: string; year: number; position: number }[] = [
  { slug: 'iphone-11', name: 'iPhone 11', year: 2019, position: 60 },
  { slug: 'iphone-12', name: 'iPhone 12', year: 2020, position: 50 },
  { slug: 'iphone-13', name: 'iPhone 13', year: 2021, position: 40 },
  { slug: 'iphone-14', name: 'iPhone 14', year: 2022, position: 30 },
  { slug: 'iphone-15', name: 'iPhone 15', year: 2023, position: 20 },
  { slug: 'iphone-16', name: 'iPhone 16', year: 2024, position: 10 },
];

const s = (value: string, label: string, price: number, compareAt?: number): SeedStorage => ({
  value,
  label,
  price,
  compareAt,
});

export const PRODUCTS: SeedProduct[] = [
  // ---------------------------------------------------------------- 11 series
  {
    name: 'iPhone XR',
    seriesSlug: 'iphone-11',
    model: 'A2105',
    silhouette: 'notch-wide',
    camera: 'single',
    colors: ['black', 'white', 'red'],
    storages: [s('64gb', '64 GB', 430), s('128gb', '128 GB', 495)],
    displaySize: '6.1-inch Liquid Retina HD',
    chip: 'A12 Bionic',
    cameraSpec: '12 MP wide',
    battery: 'Up to 16 hours video playback',
    connectivity: '4G LTE, Wi-Fi 5',
    shortDescription: 'The colour-forward classic. Still fast, still Face ID, still excellent value.',
    description:
      'The iPhone XR remains one of the most sensible phones you can buy. The A12 Bionic chip handles everything most people ask of a phone, Face ID is quick, and the 6.1-inch Liquid Retina display is comfortable for long reading. Every unit is battery-tested and fully functional.',
  },
  {
    name: 'iPhone 11',
    seriesSlug: 'iphone-11',
    model: 'A2221',
    silhouette: 'notch-wide',
    camera: 'dual',
    colors: ['black', 'white', 'purple'],
    storages: [s('64gb', '64 GB', 520), s('128gb', '128 GB', 600)],
    displaySize: '6.1-inch Liquid Retina HD',
    chip: 'A13 Bionic',
    cameraSpec: 'Dual 12 MP wide and ultra-wide',
    battery: 'Up to 17 hours video playback',
    connectivity: '4G LTE, Wi-Fi 6',
    shortDescription: 'Dual cameras, Night mode and a battery that comfortably lasts the day.',
    description:
      'The iPhone 11 added the ultra-wide camera and Night mode, and it is still the sweet spot for anyone who wants a capable camera without a flagship price. The A13 Bionic keeps it responsive years on.',
    bestseller: true,
  },
  {
    name: 'iPhone 11 Pro',
    seriesSlug: 'iphone-11',
    model: 'A2215',
    silhouette: 'notch-wide',
    camera: 'triple',
    colors: ['space-black', 'silver', 'midnight-green'],
    storages: [s('64gb', '64 GB', 650), s('256gb', '256 GB', 770)],
    displaySize: '5.8-inch Super Retina XDR',
    chip: 'A13 Bionic',
    cameraSpec: 'Triple 12 MP wide, ultra-wide and telephoto',
    battery: 'Up to 18 hours video playback',
    connectivity: '4G LTE, Wi-Fi 6',
    shortDescription: 'The first Pro. Three cameras and an OLED display in a genuinely compact body.',
    description:
      'A 5.8-inch OLED, a stainless steel frame and the triple-camera system that defined the Pro line. If you want a small phone that still takes a serious photograph, this is it.',
  },
  {
    name: 'iPhone 11 Pro Max',
    seriesSlug: 'iphone-11',
    model: 'A2218',
    silhouette: 'notch-wide',
    camera: 'triple',
    colors: ['space-black', 'silver', 'midnight-green'],
    storages: [s('64gb', '64 GB', 720), s('256gb', '256 GB', 800)],
    displaySize: '6.5-inch Super Retina XDR',
    chip: 'A13 Bionic',
    cameraSpec: 'Triple 12 MP wide, ultra-wide and telephoto',
    battery: 'Up to 20 hours video playback',
    connectivity: '4G LTE, Wi-Fi 6',
    shortDescription: 'Big OLED, big battery, three cameras.',
    description:
      'The Pro Max has the longest battery life of its generation by a wide margin, and the 6.5-inch OLED is still a beautiful display for video.',
  },

  // ---------------------------------------------------------------- 12 series
  {
    name: 'iPhone 12',
    seriesSlug: 'iphone-12',
    model: 'A2403',
    silhouette: 'notch-narrow',
    camera: 'dual',
    colors: ['black', 'white', 'blue'],
    storages: [s('64gb', '64 GB', 585), s('128gb', '128 GB', 695)],
    displaySize: '6.1-inch Super Retina XDR',
    chip: 'A14 Bionic',
    cameraSpec: 'Dual 12 MP wide and ultra-wide',
    battery: 'Up to 17 hours video playback',
    connectivity: '5G, Wi-Fi 6, MagSafe',
    shortDescription: 'Flat edges, OLED and 5G — the generation that changed the shape.',
    description:
      'The iPhone 12 brought the flat-edged design back, moved the whole line to OLED and added 5G and MagSafe. It is the oldest iPhone we would recommend for someone who wants to keep a phone for several more years.',
    bestseller: true,
  },
  {
    name: 'iPhone 12 Pro',
    seriesSlug: 'iphone-12',
    model: 'A2407',
    silhouette: 'notch-narrow',
    camera: 'triple',
    colors: ['graphite', 'silver', 'pacific-blue'],
    storages: [s('128gb', '128 GB', 850), s('256gb', '256 GB', 930)],
    displaySize: '6.1-inch Super Retina XDR',
    chip: 'A14 Bionic',
    cameraSpec: 'Triple 12 MP with LiDAR',
    battery: 'Up to 17 hours video playback',
    connectivity: '5G, Wi-Fi 6, MagSafe',
    shortDescription: 'Stainless steel, LiDAR and ProRAW.',
    description:
      'The 12 Pro added LiDAR for faster low-light focus and Apple ProRAW for people who edit their photographs properly. Pacific Blue remains the finish people ask for by name.',
  },
  {
    name: 'iPhone 12 Pro Max',
    seriesSlug: 'iphone-12',
    model: 'A2412',
    silhouette: 'notch-narrow',
    camera: 'triple',
    colors: ['graphite', 'silver', 'pacific-blue'],
    storages: [s('128gb', '128 GB', 980), s('256gb', '256 GB', 1100)],
    displaySize: '6.7-inch Super Retina XDR',
    chip: 'A14 Bionic',
    cameraSpec: 'Triple 12 MP with sensor-shift stabilisation',
    battery: 'Up to 20 hours video playback',
    connectivity: '5G, Wi-Fi 6, MagSafe',
    shortDescription: 'Sensor-shift stabilisation and the largest sensor of its generation.',
    description:
      'The 12 Pro Max was the first iPhone with sensor-shift stabilisation on the main camera, and it still produces noticeably steadier handheld video than its siblings.',
  },

  // ---------------------------------------------------------------- 13 series
  {
    name: 'iPhone 13',
    seriesSlug: 'iphone-13',
    model: 'A2633',
    silhouette: 'notch-narrow',
    camera: 'dual',
    colors: ['midnight', 'starlight', 'pink'],
    storages: [s('128gb', '128 GB', 885), s('256gb', '256 GB', 1020)],
    displaySize: '6.1-inch Super Retina XDR',
    chip: 'A15 Bionic',
    cameraSpec: 'Dual 12 MP with sensor-shift stabilisation',
    battery: 'Up to 19 hours video playback',
    connectivity: '5G, Wi-Fi 6, MagSafe',
    shortDescription: 'The value pick. Excellent battery, Cinematic mode, years of updates ahead.',
    description:
      'If you asked us to recommend one phone on this page, it would probably be this one. The A15 is still quick, battery life is genuinely good, and the camera handles low light well.',
    featured: true,
    bestseller: true,
  },
  {
    name: 'iPhone 13 Pro',
    seriesSlug: 'iphone-13',
    model: 'A2638',
    silhouette: 'notch-narrow',
    camera: 'triple',
    colors: ['graphite', 'silver', 'sierra-blue'],
    storages: [s('128gb', '128 GB', 1150), s('256gb', '256 GB', 1260)],
    displaySize: '6.1-inch Super Retina XDR, ProMotion',
    chip: 'A15 Bionic',
    cameraSpec: 'Triple 12 MP with macro and 3× telephoto',
    battery: 'Up to 22 hours video playback',
    connectivity: '5G, Wi-Fi 6, MagSafe',
    shortDescription: 'The first 120 Hz iPhone, and a real macro camera.',
    description:
      'ProMotion arrived here, and once you have used a 120 Hz iPhone it is difficult to go back. The macro camera is a genuine addition rather than a marketing one.',
    featured: true,
  },
  {
    name: 'iPhone 13 Pro Max',
    seriesSlug: 'iphone-13',
    model: 'A2643',
    silhouette: 'notch-narrow',
    camera: 'triple',
    colors: ['graphite', 'silver', 'sierra-blue'],
    storages: [s('128gb', '128 GB', 1300), s('256gb', '256 GB', 1480)],
    displaySize: '6.7-inch Super Retina XDR, ProMotion',
    chip: 'A15 Bionic',
    cameraSpec: 'Triple 12 MP with macro and 3× telephoto',
    battery: 'Up to 28 hours video playback',
    connectivity: '5G, Wi-Fi 6, MagSafe',
    shortDescription: 'Still the battery champion of the entire iPhone line.',
    description:
      'Nothing Apple has made since meaningfully beats the 13 Pro Max on battery life. If you are away from a charger all day, start here.',
    bestseller: true,
  },

  // ---------------------------------------------------------------- 14 series
  {
    name: 'iPhone 14',
    seriesSlug: 'iphone-14',
    model: 'A2882',
    silhouette: 'notch-narrow',
    camera: 'dual',
    colors: ['midnight', 'starlight', 'purple'],
    storages: [s('128gb', '128 GB', 1000), s('256gb', '256 GB', 1195)],
    displaySize: '6.1-inch Super Retina XDR',
    chip: 'A15 Bionic (5-core GPU)',
    cameraSpec: 'Dual 12 MP with Photonic Engine',
    battery: 'Up to 20 hours video playback',
    connectivity: '5G, Wi-Fi 6, Crash Detection',
    shortDescription: 'Better low-light photography and Crash Detection.',
    description:
      'The 14 refined rather than reinvented: a brighter main sensor, the Photonic Engine for low light, and safety features that are easy to overlook until you need them.',
  },
  {
    name: 'iPhone 14 Plus',
    seriesSlug: 'iphone-14',
    model: 'A2886',
    silhouette: 'notch-narrow',
    camera: 'dual',
    colors: ['midnight', 'starlight', 'purple'],
    storages: [s('128gb', '128 GB', 1120), s('256gb', '256 GB', 1270)],
    displaySize: '6.7-inch Super Retina XDR',
    chip: 'A15 Bionic (5-core GPU)',
    cameraSpec: 'Dual 12 MP with Photonic Engine',
    battery: 'Up to 26 hours video playback',
    connectivity: '5G, Wi-Fi 6, Crash Detection',
    shortDescription: 'A big screen and a very big battery, without Pro pricing.',
    description:
      'The Plus is the quiet recommendation for anyone who wants a large display and long battery life and does not care about the telephoto camera.',
  },
  {
    name: 'iPhone 14 Pro',
    seriesSlug: 'iphone-14',
    model: 'A2890',
    silhouette: 'island',
    camera: 'triple',
    colors: ['space-black', 'silver', 'deep-purple'],
    storages: [s('128gb', '128 GB', 1545), s('256gb', '256 GB', 1650)],
    displaySize: '6.1-inch Super Retina XDR, ProMotion, Always-On',
    chip: 'A16 Bionic',
    cameraSpec: '48 MP main, ultra-wide and 3× telephoto',
    battery: 'Up to 23 hours video playback',
    connectivity: '5G, Wi-Fi 6, Dynamic Island',
    shortDescription: 'The 48 MP main camera and the Dynamic Island arrive.',
    description:
      'A proper generational step: a 48 MP main sensor, the Always-On display, and the Dynamic Island replacing the notch. This is where a used Pro starts feeling current rather than old.',
    featured: true,
  },
  {
    name: 'iPhone 14 Pro Max',
    seriesSlug: 'iphone-14',
    model: 'A2894',
    silhouette: 'island',
    camera: 'triple',
    colors: ['space-black', 'silver', 'deep-purple'],
    storages: [s('128gb', '128 GB', 1780), s('256gb', '256 GB', 1850)],
    displaySize: '6.7-inch Super Retina XDR, ProMotion, Always-On',
    chip: 'A16 Bionic',
    cameraSpec: '48 MP main, ultra-wide and 3× telephoto',
    battery: 'Up to 29 hours video playback',
    connectivity: '5G, Wi-Fi 6, Dynamic Island',
    shortDescription: 'Everything the 14 Pro does, for longer.',
    description:
      'The largest, brightest display Apple had shipped at the time, paired with the 48 MP camera system and close to thirty hours of video playback.',
    bestseller: true,
  },

  // ---------------------------------------------------------------- 15 series
  {
    name: 'iPhone 15',
    seriesSlug: 'iphone-15',
    model: 'A3090',
    silhouette: 'island',
    camera: 'dual',
    colors: ['black', 'blue', 'pink'],
    storages: [s('128gb', '128 GB', 1460), s('256gb', '256 GB', 1635)],
    displaySize: '6.1-inch Super Retina XDR',
    chip: 'A16 Bionic',
    cameraSpec: '48 MP main and 12 MP ultra-wide',
    battery: 'Up to 20 hours video playback',
    connectivity: '5G, Wi-Fi 6, USB-C, Dynamic Island',
    shortDescription: 'USB-C, the Dynamic Island and a 48 MP camera on the standard model.',
    description:
      'The 15 is the first standard iPhone with USB-C and the Dynamic Island, and it inherits the 48 MP main camera from the previous Pro. For most people this is the practical upgrade point.',
    featured: true,
  },
  {
    name: 'iPhone 15 Plus',
    seriesSlug: 'iphone-15',
    model: 'A3094',
    silhouette: 'island',
    camera: 'dual',
    colors: ['black', 'blue', 'pink'],
    storages: [s('128gb', '128 GB', 1540), s('256gb', '256 GB', 1700)],
    displaySize: '6.7-inch Super Retina XDR',
    chip: 'A16 Bionic',
    cameraSpec: '48 MP main and 12 MP ultra-wide',
    battery: 'Up to 26 hours video playback',
    connectivity: '5G, Wi-Fi 6, USB-C, Dynamic Island',
    shortDescription: 'The large-screen 15, with the battery to match.',
    description:
      'Same camera and chip as the iPhone 15, in the larger body with substantially more battery.',
  },
  {
    name: 'iPhone 15 Pro',
    seriesSlug: 'iphone-15',
    model: 'A3102',
    silhouette: 'island',
    camera: 'triple',
    colors: ['natural-titanium', 'blue-titanium', 'black-titanium'],
    storages: [s('128gb', '128 GB', 1900), s('256gb', '256 GB', 1990)],
    displaySize: '6.1-inch Super Retina XDR, ProMotion, Always-On',
    chip: 'A17 Pro',
    cameraSpec: '48 MP main, ultra-wide and 3× telephoto',
    battery: 'Up to 23 hours video playback',
    connectivity: '5G, Wi-Fi 6E, USB-C 3, Action button',
    shortDescription: 'Titanium, the Action button and USB-C 3 transfer speeds.',
    description:
      'Titanium made the Pro noticeably lighter, and the Action button is the first genuinely configurable hardware control on an iPhone. The A17 Pro handles console-class games.',
    featured: true,
    bestseller: true,
  },
  {
    name: 'iPhone 15 Pro Max',
    seriesSlug: 'iphone-15',
    model: 'A3106',
    silhouette: 'island',
    camera: 'triple',
    colors: ['natural-titanium', 'blue-titanium', 'black-titanium'],
    storages: [s('256gb', '256 GB', 2300)],
    displaySize: '6.7-inch Super Retina XDR, ProMotion, Always-On',
    chip: 'A17 Pro',
    cameraSpec: '48 MP main, ultra-wide and 5× tetraprism telephoto',
    battery: 'Up to 29 hours video playback',
    connectivity: '5G, Wi-Fi 6E, USB-C 3, Action button',
    shortDescription: 'The 5× tetraprism telephoto — a real reach advantage.',
    description:
      'The 5× telephoto is exclusive to the Pro Max of this generation and it is the single biggest reason to choose it. Titanium keeps the weight sensible for a phone this size.',
    featured: true,
  },

  // ---------------------------------------------------------------- 16 series
  {
    name: 'iPhone 16',
    seriesSlug: 'iphone-16',
    model: 'A3287',
    silhouette: 'island',
    camera: 'dual',
    colors: ['black', 'white', 'ultramarine'],
    storages: [s('128gb', '128 GB', 2070), s('256gb', '256 GB', 2300)],
    displaySize: '6.1-inch Super Retina XDR',
    chip: 'A18',
    cameraSpec: '48 MP Fusion and 12 MP ultra-wide with macro',
    battery: 'Up to 22 hours video playback',
    connectivity: '5G, Wi-Fi 7, USB-C, Action button, Camera Control',
    shortDescription: 'Camera Control, the Action button and macro on the standard model.',
    description:
      'The 16 brings the Action button and the new Camera Control to the standard line, along with a vertical camera layout for spatial video. Wi-Fi 7 and the A18 keep it current for years.',
    newArrival: true,
    featured: true,
  },
  {
    name: 'iPhone 16 Plus',
    seriesSlug: 'iphone-16',
    model: 'A3290',
    silhouette: 'island',
    camera: 'dual',
    colors: ['black', 'white', 'ultramarine'],
    storages: [s('128gb', '128 GB', 2270), s('256gb', '256 GB', 2625)],
    displaySize: '6.7-inch Super Retina XDR',
    chip: 'A18',
    cameraSpec: '48 MP Fusion and 12 MP ultra-wide with macro',
    battery: 'Up to 27 hours video playback',
    connectivity: '5G, Wi-Fi 7, USB-C, Action button, Camera Control',
    shortDescription: 'The big-screen 16, with the longest battery in the standard line.',
    description:
      'Everything the iPhone 16 offers on a 6.7-inch display, with roughly five more hours of video playback.',
    newArrival: true,
  },
  {
    name: 'iPhone 16 Pro',
    seriesSlug: 'iphone-16',
    model: 'A3293',
    silhouette: 'island',
    camera: 'triple',
    colors: ['natural-titanium', 'black-titanium', 'desert-titanium'],
    storages: [s('256gb', '256 GB', 2670)],
    displaySize: '6.3-inch Super Retina XDR, ProMotion, Always-On',
    chip: 'A18 Pro',
    cameraSpec: '48 MP Fusion, 48 MP ultra-wide and 5× telephoto',
    battery: 'Up to 27 hours video playback',
    connectivity: '5G, Wi-Fi 7, USB-C 3, Action button, Camera Control',
    shortDescription: 'The current Pro. Larger display, 5× telephoto, 48 MP ultra-wide.',
    description:
      'The 16 Pro takes the 5× telephoto that used to be Pro Max only, adds a 48 MP ultra-wide and grows the display to 6.3 inches without becoming unwieldy. This is the most capable phone on this page.',
    newArrival: true,
    featured: true,
    bestseller: true,
  },
];

/** Storage attribute values, in the order they should appear everywhere. */
export const STORAGE_VALUES = [
  { value: '64gb', label: '64 GB', position: 10 },
  { value: '128gb', label: '128 GB', position: 20 },
  { value: '256gb', label: '256 GB', position: 30 },
  { value: '512gb', label: '512 GB', position: 40 },
  { value: '1tb', label: '1 TB', position: 50 },
];

/** RAM values seeded so a laptop category works out of the box. */
export const RAM_VALUES = [
  { value: '8gb', label: '8 GB', position: 10 },
  { value: '16gb', label: '16 GB', position: 20 },
  { value: '32gb', label: '32 GB', position: 30 },
  { value: '64gb', label: '64 GB', position: 40 },
];
