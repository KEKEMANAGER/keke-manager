const fs = require('fs');
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const upstreamResolveRequest = config.resolver.resolveRequest;

const ICON_FONTS_DIR = path.join(
  __dirname,
  'node_modules',
  '@expo',
  'vector-icons',
  'build',
  'vendor',
  'react-native-vector-icons',
  'Fonts',
);

const ALLOWED_ICON_FONTS = new Set(['Ionicons.ttf']);

if (fs.existsSync(ICON_FONTS_DIR)) {
  const blockedFonts = fs
    .readdirSync(ICON_FONTS_DIR)
    .filter((file) => file.endsWith('.ttf') && !ALLOWED_ICON_FONTS.has(file))
    .map(
      (file) =>
        new RegExp(
          `${ICON_FONTS_DIR.replace(/[/\\]/g, '[\\\\/]')}[\\\\/]${file.replace(/\./g, '\\.')}$`,
        ),
    );

  config.resolver.blockList = [...(config.resolver.blockList ?? []), ...blockedFonts];
}

config.resolver.resolveRequest = (context, moduleName, platform, ...rest) => {
  if (platform === 'web' && moduleName === '@expo/vector-icons') {
    return {
      type: 'sourceFile',
      filePath: path.resolve(__dirname, 'metro-shims/expo-vector-icons.js'),
    };
  }
  if (
    platform === 'web' &&
    (moduleName === '@react-native-community/datetimepicker' ||
      moduleName.startsWith('@react-native-community/datetimepicker/'))
  ) {
    return {
      type: 'sourceFile',
      filePath: path.resolve(__dirname, 'metro-shims/datetimepicker.web.js'),
    };
  }
  if (
    platform === 'web' &&
    (moduleName === 'react-native-screens' || moduleName.startsWith('react-native-screens/'))
  ) {
    return {
      type: 'sourceFile',
      filePath: path.resolve(__dirname, 'metro-shims/react-native-screens.web.js'),
    };
  }
  if (
    platform === 'web' &&
    (moduleName === 'react-native-maps' || moduleName.startsWith('react-native-maps/'))
  ) {
    return {
      type: 'sourceFile',
      filePath: path.resolve(__dirname, 'metro-shims/react-native-maps.js'),
    };
  }
  if (typeof upstreamResolveRequest === 'function') {
    return upstreamResolveRequest(context, moduleName, platform, ...rest);
  }
  return context.resolveRequest(context, moduleName, platform, ...rest);
};

module.exports = config;
