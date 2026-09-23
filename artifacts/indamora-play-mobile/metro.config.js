const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const mobileReactQueryEntry = require.resolve('@tanstack/react-query', {
  paths: [__dirname],
});
const defaultResolveRequest = config.resolver.resolveRequest;

// The shared API client exports React Query hooks. Force Metro to resolve the
// same instance as the mobile app so hooks see the app's QueryClientProvider.
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  '@tanstack/react-query': path.resolve(
    __dirname,
    'node_modules/@tanstack/react-query',
  ),
};
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@tanstack/react-query') {
    return {
      type: 'sourceFile',
      filePath: mobileReactQueryEntry,
    };
  }
  return defaultResolveRequest
    ? defaultResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
