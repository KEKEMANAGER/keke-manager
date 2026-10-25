import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS, RADIUS, SPACING } from '../constants/theme';
import { extractGoogleMapsLink } from '../lib/googleMapsLink';
import {
  navigationQueryFromLocation,
  openPlaceNavigation,
  type NavPlace,
} from '../lib/openExternalNavigation';

type Props = {
  /** Place names, or places with the exact Google Maps link the company gave. */
  places: (string | NavPlace)[];
  /** Numbered 1, 2, 3… when the list is the order of the day. */
  numbered?: boolean;
  /** Shown on a chip whose place has a link but no name. */
  fallbackName?: string;
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
 *
 * A hotel or an address may also carry the company's own Google Maps link; the
 * chip then opens that exact spot, and wears a pin to say so.
 */
export function NavigablePlaceChips({ places, numbered = false, fallbackName = '' }: Props) {
  if (places.length === 0) return null;

  return (
    <View style={styles.wrap}>
      {places.map((entry, i) => {
        const place: NavPlace = typeof entry === 'string' ? { name: entry } : entry;
        const name = place.name.trim() || fallbackName;
        const link = extractGoogleMapsLink(place.link);
        const query = navigationQueryFromLocation(place.name);
        if (!query && !link) return null;
        return (
          <Pressable
            key={`${i}-${name}`}
            onPress={() => void openPlaceNavigation(query, link)}
            style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
            accessibilityRole="link"
            accessibilityLabel={name}
            hitSlop={4}
          >
            <Ionicons name={link ? 'location' : 'navigate'} size={13} color={COLORS.goldDark} />
            <Text style={styles.chipText} numberOfLines={2}>
              {numbered ? `${i + 1}. ` : ''}
              {name}
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
