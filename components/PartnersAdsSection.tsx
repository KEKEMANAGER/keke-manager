import {
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../constants/theme';
import type { AdCard } from '../lib/ads';

type Props = {
  ads: AdCard[];
  /** Defaults to „პარტნიორები“. */
  title?: string;
};

export function PartnersAdsSection({ ads, title = '🤝 პარტნიორები' }: Props) {
  if (ads.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.adsRow}
        style={styles.adsScroll}
      >
        {ads.map((ad) => (
          <Pressable
            key={ad.id}
            onPress={() => (ad.link_url ? void Linking.openURL(ad.link_url) : undefined)}
            style={({ pressed }) => [styles.adCard, pressed && styles.adCardPressed]}
          >
            {ad.image_url ? (
              <Image source={{ uri: ad.image_url }} style={styles.adImage} resizeMode="cover" />
            ) : (
              <View style={styles.adImagePlaceholder}>
                <Text style={styles.adImageEmoji}>📢</Text>
              </View>
            )}
            <View style={styles.adInfo}>
              <Text style={styles.adTitle} numberOfLines={1}>
                {ad.title}
              </Text>
              {ad.subtitle ? (
                <Text style={styles.adSubtitle} numberOfLines={1}>
                  {ad.subtitle}
                </Text>
              ) : null}
            </View>
            <View style={styles.adBadge}>
              <Text style={styles.adBadgeText}>Ad</Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: SPACING.md,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  adsScroll: {
    marginBottom: SPACING.xs,
  },
  adsRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    paddingRight: SPACING.md,
  },
  adCard: {
    width: 160,
    borderRadius: RADIUS.card,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    ...SHADOWS.card,
  },
  adCardPressed: {
    opacity: 0.85,
  },
  adImage: {
    width: '100%',
    height: 90,
  },
  adImagePlaceholder: {
    width: '100%',
    height: 90,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  adImageEmoji: {
    fontSize: 32,
  },
  adInfo: {
    padding: SPACING.sm,
  },
  adTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.text,
  },
  adSubtitle: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  adBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  adBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
});
