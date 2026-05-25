import { Redirect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View, Text, StyleSheet } from 'react-native';
import FleetScreen from './fleet';
import { EmptyState } from '../../components/EmptyState';
import { COLORS, SPACING } from '../../constants/theme';
import { useAuth } from '../../contexts/AuthContext';

export default function HiredDriversScreen() {
  const { t } = useTranslation();
  const { isHost, menuRole } = useAuth();

  if (menuRole !== 'freelance_driver') {
    return <Redirect href="/(driver)/dashboard" />;
  }

  if (!isHost) {
    return (
      <View style={styles.wrap}>
        <EmptyState
          icon="users"
          title={t('menu.hostOnlyTitle')}
          subtitle={t('menu.hostOnlyBody')}
        />
        <Text style={styles.hint}>{t('menu.hostFleetHint')}</Text>
      </View>
    );
  }

  return <FleetScreen />;
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    padding: SPACING.md,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
  },
  hint: {
    textAlign: 'center',
    color: COLORS.textSecondary,
    fontSize: 13,
    marginTop: SPACING.md,
    paddingHorizontal: SPACING.lg,
  },
});
