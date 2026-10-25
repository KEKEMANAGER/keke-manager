import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS, RADIUS, SPACING } from '../constants/theme';
import { navigationQueryFromLocation, openExternalNavigation } from '../lib/openExternalNavigation';

type Props = {
  places: string[];
  /** Numbered 1, 2, 3… when the list is the order of the day. */
  numbered?: boolean;
};

/**
 * Places a driver can tap to drive to: each opens Google Maps (Apple Maps on an
 * iPhone without it) with directions to that exact place.
 *
 * A tour programme already names every stop — the cathedral, the bridge, the
 * canyon — and the name is all Maps needs. Shown as plain text, the driver had
 * to retype each one into Maps on the road; the only navigation button he had
 * pointed at the tour's title ("Mtskheta & Uplistsikhe Cave Tour"), which Maps
 * cannot find.
 */
export function NavigablePlaceChips({ places, numbered = false }: Props) {
  if (places.length === 0) return null;

  return (
    <View style={styles.wrap}>
      {places.map((place, i) => {
        const query = navigationQueryFromLocation(place);
        if (!query) return null;
        return (
          <Pressable
            key={`${i}-${place}`}
            onPress={() => void openExternalNavigation(query)}
            style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
            accessibilityRole="link"
            accessibilityLabel={place}
            hitSlop={4}
          >
            <Ionicons name="navigate" size={13} color={COLORS.goldDark} />
            <Text style={styles.chipText} numberOfLines={2}>
              {numbered ? `${i + 1}. ` : ''}
              {place}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: SPACING.xs,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: '100%',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  chipText: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
  },
  pressed: {
    opacity: 0.85,
  },
});
