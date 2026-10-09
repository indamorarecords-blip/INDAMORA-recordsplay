import type { StoreSku } from '@workspace/api-client-react';
import officialQr from '../../../../mockups/indamora-play/resources/indamora-play-qr.svg';
import hoodieRoots from '../../../../attached_assets/IMG_3387_1791538149840.jpeg';
import hoodieTalent from '../../../../attached_assets/IMG_3388_1791538149840.jpeg';
import bobOrangeWhite from '../../../../attached_assets/IMG_3389_1791538149840.jpeg';
import tshirtPink from '../../../../attached_assets/IMG_3390_1791538149840.jpeg';
import bobBlack from '../../../../attached_assets/IMG_3391_1791538149840.jpeg';
import tshirtAfrica from '../../../../attached_assets/IMG_3392_1791538149840.jpeg';
import toteBag from '../../../../attached_assets/IMG_3395_1791538149840.jpeg';
import tshirtDetails from '../../../../attached_assets/AEEDAA04-AFB7-4383-AC87-C143F64FAD76_1791538149840.png';
import tshirtPressPlay from '../../../../attached_assets/389CB62C-81B4-4AA9-B231-E66F73DDA2EF_1791538149840.jpeg';

// Originals are never modified. A `crop` is a display-only window (fractions of the
// original, aspect locked by `ratio` = displayed width / height) onto the same file.
export type PhotoCrop = { x: number; y: number; w: number; h: number; ratio: number };
export type ProductPhoto = { src: string; original: string; label: string; crop?: PhotoCrop };
export type ProductColor = 'rose' | 'noir' | 'blanc' | 'orange';

export const COLOR_LABELS: Record<ProductColor, string> = { rose: 'Rose', noir: 'Noir', blanc: 'Blanc', orange: 'Orange' };
export const COLOR_SWATCH: Record<ProductColor, string> = { rose: '#F4A6C1', noir: '#111111', blanc: '#FFFFFF', orange: '#E8742A' };
export const PRODUCT_COLORS: Partial<Record<StoreSku, readonly ProductColor[]>> = {
  tshirt: ['rose', 'noir', 'blanc'],
  bob: ['blanc', 'noir', 'orange'],
};

const photo = (src: string, label: string, crop?: PhotoCrop): ProductPhoto => ({ src, original: src, label, crop });

// Image 1254x1254: black tee = left front only (white back is never shown as black).
const BLACK_TEE_FRONT: PhotoCrop = { x: 0, y: 0.02, w: 0.5, h: 0.64, ratio: (0.5 * 1254) / (0.64 * 1254) };
// IMG_3389 is 748x383: orange bob left, white bob right.
const BOB_ORANGE: PhotoCrop = { x: 0, y: 0, w: 0.47, h: 1, ratio: (0.47 * 748) / 383 };
const BOB_WHITE: PhotoCrop = { x: 0.47, y: 0, w: 0.53, h: 1, ratio: (0.53 * 748) / 383 };

const VARIANT_PHOTOS: Record<string, readonly ProductPhoto[]> = {
  'tshirt:rose': [photo(tshirtPink, 'T-shirt rose')],
  'tshirt:noir': [photo(tshirtDetails, 'T-shirt noir, face avant', BLACK_TEE_FRONT)],
  'tshirt:blanc': [photo(tshirtPressPlay, 'T-shirt blanc'), photo(tshirtAfrica, 'T-shirt blanc, autre vue')],
  'bob:noir': [photo(bobBlack, 'Bob noir')],
  'bob:blanc': [photo(bobOrangeWhite, 'Bob blanc', BOB_WHITE)],
  'bob:orange': [photo(bobOrangeWhite, 'Bob orange', BOB_ORANGE)],
  'tote-bag': [photo(toteBag, 'Tote bag')],
  hoodie: [photo(hoodieRoots, 'Sweat à capuche, vue 1'), photo(hoodieTalent, 'Sweat à capuche, vue 2')],
};

export const OFFICIAL_PREVIEW_QR = officialQr;

export function getProductPhotos(sku: StoreSku, color?: ProductColor): readonly ProductPhoto[] {
  return VARIANT_PHOTOS[color ? `${sku}:${color}` : sku] ?? [];
}
