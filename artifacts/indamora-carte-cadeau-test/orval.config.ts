import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'orval';

const root = path.dirname(fileURLToPath(import.meta.url));
const generated = path.join(root, 'src', 'generated');

export default defineConfig({
  giftcard: {
    input: path.join(root, 'openapi.yaml'),
    output: {
      workspace: generated,
      target: 'api',
      schemas: 'models',
      client: 'react-query',
      mode: 'split',
      baseUrl: '/carte-cadeau-api',
      clean: true,
      prettier: true,
      override: {
        fetch: {
          includeHttpResponseReturnType: false,
        },
        mutator: {
          path: path.join(root, 'src', 'api', 'fetcher.ts'),
          name: 'giftcardFetch',
        },
      },
    },
  },
});
