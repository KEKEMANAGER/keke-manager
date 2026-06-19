const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const upstreamResolveRequest = config.resolver.resolveRequest;

const VECTOR_ICONS_SHIM = path.resolve(__dirname, 'metro-shims/expo-vector-icons.js');
const SUPABASE_ROOT = path.join(__dirname, 'node_modules', '@supabase', 'supabase-js');
const SUPABASE_CJS = {
  '@supabase/supabase-js': path.join(SUPABASE_ROOT, 'dist', 'index.cjs'),
  '@supabase/supabase-js/cors': path.join(SUPABASE_ROOT, 'dist', 'cors.cjs'),
};

config.resolver.resolveRequest = (context, moduleName, platform, ...rest) => {
  // Hermes cannot compile dynamic import(OTEL_PKG) from transitive deps (e.g. Supabase).
  if (moduleName === '@opentelemetry' || moduleName.startsWith('@opentelemetry/')) {
    return { type: 'empty' };
  }
  const supabaseCjs = SUPABASE_CJS[moduleName];
  if (supabaseCjs) {
    return { type: 'sourceFile', filePath: supabaseCjs };
  }
  // App only uses Ionicons — IconsLazy pulls every font (AntDesign, Fontisto, …).
  if (
    moduleName === '@expo/vector-icons' ||
    moduleName === '@expo/vector-icons/build/IconsLazy.js' ||
    moduleName === '@expo/vector-icons/build/IconsLazy' ||
    moduleName === '@expo/vector-icons/build/Icons.js' ||
    moduleName === '@expo/vector-icons/build/Icons'
  ) {
    return { type: 'sourceFile', filePath: VECTOR_ICONS_SHIM };
  }
  if (
    moduleName.startsWith('@expo/vector-icons/build/') &&
    !moduleName.includes('Ionicons') &&
    !moduleName.includes('createIconSet') &&
    !moduleName.includes('/vendor/') &&
    !moduleName.includes('/glyphmaps/')
  ) {
    return { type: 'empty' };
  }
  if (
    moduleName.includes('react-native-vector-icons/Fonts/') &&
    moduleName.endsWith('.ttf') &&
    !moduleName.endsWith('Ionicons.ttf')
  ) {
    return { type: 'empty' };
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
