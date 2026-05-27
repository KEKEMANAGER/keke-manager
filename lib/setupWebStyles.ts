/**
 * Patches core react-native components on web so style arrays never reach the DOM.
 * React 19 throws: "Failed to set an indexed property [0] on 'CSSStyleDeclaration'".
 * Load this module before expo-router via index.js.
 */
import React from 'react';
import { Platform, StyleSheet } from 'react-native';

function flattenStyle(style: unknown): unknown {
  if (style == null) return style;
  if (typeof style === 'function') {
    return (state: unknown) => flattenStyle((style as (s: unknown) => unknown)(state));
  }
  if (Array.isArray(style)) {
    return StyleSheet.flatten(style);
  }
  return style;
}

type AnyProps = Record<string, unknown>;

function wrapComponent<T extends React.ComponentType<AnyProps>>(
  Component: T,
  extraStyleKeys: string[] = [],
): T {
  const Wrapped = React.forwardRef<unknown, AnyProps>((props, ref) => {
    const next: AnyProps = { ...props, ref };
    if ('style' in props) {
      next.style = flattenStyle(props.style);
    }
    for (const key of extraStyleKeys) {
      if (key in props) {
        next[key] = flattenStyle(props[key]);
      }
    }
    return React.createElement(Component, next);
  });
  const name = (Component as { displayName?: string }).displayName ?? 'Component';
  Wrapped.displayName = `WebFlat(${name})`;
  return Wrapped as T;
}

if (Platform.OS === 'web') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const RN = require('react-native') as typeof import('react-native');

  RN.View = wrapComponent(RN.View);
  RN.Text = wrapComponent(RN.Text);
  RN.Pressable = wrapComponent(RN.Pressable);
  RN.ScrollView = wrapComponent(RN.ScrollView, ['contentContainerStyle']);
  RN.Image = wrapComponent(RN.Image);
  RN.TextInput = wrapComponent(RN.TextInput);

  const animated = RN.Animated as typeof RN.Animated & {
    View?: React.ComponentType<AnyProps>;
    Text?: React.ComponentType<AnyProps>;
    Image?: React.ComponentType<AnyProps>;
  };
  if (animated?.View) animated.View = wrapComponent(animated.View);
  if (animated?.Text) animated.Text = wrapComponent(animated.Text);
  if (animated?.Image) animated.Image = wrapComponent(animated.Image);
}

export {};
