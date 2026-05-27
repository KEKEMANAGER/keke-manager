module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: ['./babel-plugin-flatten-rn-styles.cjs', 'expo-router/babel'],
  };
};
