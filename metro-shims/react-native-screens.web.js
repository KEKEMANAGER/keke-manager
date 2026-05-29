/** Minimal web stub — expo-router on web does not need native screen primitives. */
const React = require('react');
const { View } = require('react-native');

function ScreenContainer(props) {
  return React.createElement(View, props, props.children);
}

module.exports = {
  enableScreens: () => {},
  screensEnabled: () => false,
  Screen: ScreenContainer,
  ScreenContainer,
  NativeScreen: ScreenContainer,
  NativeScreenContainer: ScreenContainer,
  ScreenStack: ScreenContainer,
  ScreenStackHeaderConfig: () => null,
  ScreenStackHeaderSubview: View,
  ScreenStackHeaderCenterView: View,
  ScreenStackHeaderLeftView: View,
  ScreenStackHeaderRightView: View,
  ScreenStackHeaderBackButtonImage: View,
  ScreenStackHeaderSearchBarView: View,
  SearchBar: View,
  FullWindowOverlay: ScreenContainer,
  ScreenFooter: View,
  ScreenContentWrapper: ScreenContainer,
};
