import type { StoreSku } from '@workspace/api-client-react';
import officialQr from '../../../../mockups/indamora-play/resources/indamora-play-qr.svg';

// This module is reachable only from the development-only Boutique route.
export const PREVIEW_DESIGNS = [
  { file: '01-im-from-central-africa', label: 'I’M FROM CENTRAL AFRICA' },
  { file: '02-no-label-just-talent', label: 'NO LABEL. JUST TALENT.' },
  { file: '03-baddie-with-roots', label: 'BADDIE WITH ROOTS.' },
  { file: '04-from-bangui-to-the-world', label: 'FROM BANGUI TO THE WORLD.' },
  { file: '05-bangui-society', label: 'BANGUI SOCIETY' },
  { file: '06-sango-society', label: 'SANGO SOCIETY' },
] as const;

const folders: Record<StoreSku, string> = {
  tshirt: 'tshirts', cap: 'caps', bob: 'bobs',
  'tote-bag': 'tote-bags', 'phone-case': 'phone-cases',
};

const thumbnails = import.meta.glob<string>('./boutique-preview-assets/*.webp', {
  eager: true, query: '?url', import: 'default',
});
const mockups = import.meta.glob<string>([
  '../../../../mockups/indamora-play/tshirts/*.png',
  '../../../../mockups/indamora-play/caps/*.png',
  '../../../../mockups/indamora-play/bobs/*.png',
  '../../../../mockups/indamora-play/tote-bags/*.png',
  '../../../../mockups/indamora-play/phone-cases/*.png',
], { eager: true, query: '?url', import: 'default' });

export const OFFICIAL_PREVIEW_QR = officialQr;

export function getPreviewMedia(sku: StoreSku, designIndex: number) {
  const design = PREVIEW_DESIGNS[designIndex] ?? PREVIEW_DESIGNS[0];
  return {
    label: design.label,
    image: thumbnails[`./boutique-preview-assets/${sku}-${design.file}.webp`],
    mockup: mockups[`../../../../mockups/indamora-play/${folders[sku]}/${design.file}.png`],
  };
}
