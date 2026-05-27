import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { sx } from '../lib/sx';

export interface AnimatedSplashProps {
  onFinish: () => void;
}

export default function AnimatedSplash({ onFinish }: AnimatedSplashProps) {
  const { t } = useTranslation();
  const kOpacity = useRef(new Animated.Value(0)).current;
  const kScale = useRef(new Animated.Value(0.3)).current;
  const roadWidth = useRef(new Animated.Value(0)).current;
  const arrowOpacity = useRef(new Animated.Value(0)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const titleTranslateY = useRef(new Animated.Value(20)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const screenOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const animation = Animated.parallel([
      Animated.parallel([
        Animated.timing(kOpacity, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(kScale, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
      Animated.sequence([
        Animated.delay(600),
        Animated.timing(roadWidth, {
          toValue: 100,
          duration: 800,
          useNativeDriver: false,
        }),
      ]),
      Animated.sequence([
        Animated.delay(1200),
        Animated.timing(arrowOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]),
      Animated.sequence([
        Animated.delay(1200),
        Animated.parallel([
          Animated.timing(titleOpacity, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(titleTranslateY, {
            toValue: 0,
            duration: 800,
            useNativeDriver: true,
          }),
        ]),
      ]),
      Animated.sequence([
        Animated.delay(1800),
        Animated.timing(taglineOpacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
      ]),
      Animated.sequence([
        Animated.delay(2200),
        Animated.timing(screenOpacity, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]),
    ]);

    animation.start(({ finished }) => {
      if (finished) onFinish();
    });

    return () => animation.stop();
  }, [
    arrowOpacity,
    kOpacity,
    kScale,
    onFinish,
    roadWidth,
    screenOpacity,
    taglineOpacity,
    titleOpacity,
    titleTranslateY,
  ]);

  return (
    <Animated.View style={sx(styles.container, { opacity: screenOpacity })}>
      <View style={styles.content}>
        <View style={styles.logoRow}>
          <Animated.Text
            style={sx(styles.kLetter, {
              opacity: kOpacity,
              transform: [{ scale: kScale }],
            })}
          >
            K
          </Animated.Text>
          <View style={styles.roadRow}>
            <Animated.View style={sx(styles.roadLine, { width: roadWidth })} />
            <Animated.View style={sx(styles.arrowHead, { opacity: arrowOpacity })} />
          </View>
        </View>
        <Animated.Text
          style={sx(styles.title, {
            opacity: titleOpacity,
            transform: [{ translateY: titleTranslateY }],
          })}
        >
          KEKE MANAGER
        </Animated.Text>
        <Animated.Text style={sx(styles.tagline, { opacity: taglineOpacity })}>
          {t('auth.tagline')}
        </Animated.Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  kLetter: {
    fontSize: 120,
    fontWeight: '900',
    color: '#1A1A2E',
    lineHeight: 130,
  },
  roadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 4,
    height: 12,
  },
  roadLine: {
    height: 3,
    backgroundColor: '#F5A623',
    borderRadius: 2,
  },
  arrowHead: {
    width: 0,
    height: 0,
    marginLeft: 2,
    borderLeftWidth: 8,
    borderRightWidth: 0,
    borderTopWidth: 5,
    borderBottomWidth: 5,
    borderLeftColor: '#F5A623',
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 4,
    color: '#1A1A2E',
    marginBottom: 8,
  },
  tagline: {
    fontSize: 13,
    color: '#9CA3AF',
    textAlign: 'center',
  },
});
