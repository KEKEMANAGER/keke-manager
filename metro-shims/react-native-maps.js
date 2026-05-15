const React = require('react');
const { View } = require('react-native');

function MapViewStub(props) {
  return React.createElement(View, {
    ...props,
    style: [{ flex: 1, backgroundColor: '#1a1a2e' }, props.style],
  });
}

function MarkerStub() {
  return null;
}

module.exports = MapViewStub;
module.exports.default = MapViewStub;
module.exports.Marker = MarkerStub;
