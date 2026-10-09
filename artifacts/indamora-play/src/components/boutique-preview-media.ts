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

// Original uploads, unchanged. This module is reachable only in development.
const PRODUCT_PHOTOS: Record<StoreSku, readonly string[]> = {
  tshirt: [tshirtPressPlay, tshirtAfrica, tshirtPink, tshirtDetails],
  bob: [bobBlack, bobOrangeWhite],
  'tote-bag': [toteBag],
  hoodie: [hoodieRoots, hoodieTalent],
};

export const OFFICIAL_PREVIEW_QR = officialQr;

export function getProductPhotos(sku: StoreSku): readonly string[] {
  return PRODUCT_PHOTOS[sku];
}
