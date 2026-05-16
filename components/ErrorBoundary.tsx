import { Ionicons } from '@expo/vector-icons';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../constants/theme';
import i18n from '../src/lib/i18n';

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
};

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    if (__DEV__) {
      console.error('[ErrorBoundary]', error, info.componentStack);
    }
  }

  private handleRetry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.screen}>
          <View style={styles.card}>
            <Ionicons name="warning-outline" size={48} color={COLORS.gold} />
            <Text style={styles.title}>{i18n.t('errorBoundary.title')}</Text>
            <Text style={styles.subtitle}>{i18n.t('errorBoundary.subtitle')}</Text>
            <Pressable
              onPress={this.handleRetry}
              style={({ pressed }) => [styles.button, SHADOWS.button, pressed && styles.pressed]}
            >
              <Text style={styles.buttonText}>{i18n.t('errorBoundary.retry')}</Text>
            </Pressable>
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.xl,
    alignItems: 'center',
    maxWidth: 360,
    width: '100%',
    ...SHADOWS.card,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.text,
    marginTop: SPACING.md,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: SPACING.sm,
    marginBottom: SPACING.lg,
    lineHeight: 20,
  },
  button: {
    backgroundColor: COLORS.gold,
    borderRadius: RADIUS.button,
    paddingVertical: 14,
    paddingHorizontal: SPACING.xl,
    minWidth: 160,
    alignItems: 'center',
  },
  buttonText: {
    color: COLORS.black,
    fontWeight: '800',
    fontSize: 16,
  },
  pressed: {
    opacity: 0.9,
    backgroundColor: COLORS.goldDark,
  },
});
