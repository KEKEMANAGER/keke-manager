import { Ionicons } from '@expo/vector-icons';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS, RADIUS, SPACING } from '../../constants/theme';
import i18n from '../../src/lib/i18n';

type Props = {
  children: ReactNode;
  fallback?: ReactNode;
  onRetry?: () => void;
};

type State = {
  hasError: boolean;
};

/** Catches render errors from react-native-maps so the GPS tab does not crash the app. */
export class MapErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    if (__DEV__) {
      console.warn('[MapErrorBoundary]', error.message, info.componentStack);
    }
  }

  private handleRetry = () => {
    this.setState({ hasError: false });
    this.props.onRetry?.();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <View style={styles.fallback}>
          <Ionicons name="map-outline" size={40} color={COLORS.textMuted} />
          <Text style={styles.title}>{i18n.t('tracking.mapLoadError')}</Text>
          <Text style={styles.sub}>{i18n.t('tracking.mapUnavailable')}</Text>
          <Pressable onPress={this.handleRetry} style={styles.retryBtn}>
            <Text style={styles.retryText}>{i18n.t('common.retry')}</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.lg,
    backgroundColor: COLORS.background,
    gap: SPACING.sm,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
  },
  sub: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  retryBtn: {
    marginTop: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 10,
    borderRadius: RADIUS.button,
    backgroundColor: COLORS.goldTint,
  },
  retryText: {
    color: COLORS.goldDark,
    fontWeight: '700',
  },
});
