import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { COLORS, RADIUS, SPACING } from '../../constants/theme';
import { fetchAdminVerificationQueueCount } from '../../lib/adminVerification';
import { fetchAdminVehicleVerificationQueueCount } from '../../lib/vehicleVerification';
import { AdminVerifySection } from './AdminVerifySection';
import { AdminVehicleVerifySection } from './AdminVehicleVerifySection';
import { AdminVehiclePhotoAuditSection } from './AdminVehiclePhotoAuditSection';

type VerifySubTab = 'companies' | 'drivers' | 'vehicles' | 'photos';

function AdminSearchInput({
  value,
  onChangeText,
}: {
  value: string;
  onChangeText: (text: string) => void;
}) {
  return (
    <View style={styles.searchWrap}>
      <Ionicons name="search-outline" size={20} color={COLORS.textMuted} style={styles.searchIcon} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder="Search by name or email"
        placeholderTextColor={COLORS.gray}
        style={styles.searchInput}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        clearButtonMode="while-editing"
      />
    </View>
  );
}

export function AdminVerifyPanel() {
  const { t } = useTranslation();
  // Companies come first: one of them waiting means a business that cannot
  // work at all until it is looked at, while a driver in the queue is one of
  // many who could take the job.
  const [subTab, setSubTab] = useState<VerifySubTab>('companies');
  const [searchQuery, setSearchQuery] = useState('');
  const [companyCount, setCompanyCount] = useState(0);
  const [driverCount, setDriverCount] = useState(0);
  const [vehicleCount, setVehicleCount] = useState(0);

  const refreshCounts = useCallback(async () => {
    const [companies, drivers, vehicles] = await Promise.all([
      fetchAdminVerificationQueueCount({ role: 'company' }),
      fetchAdminVerificationQueueCount({ role: 'driver' }),
      fetchAdminVehicleVerificationQueueCount(),
    ]);
    setCompanyCount(companies);
    setDriverCount(drivers);
    setVehicleCount(vehicles);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refreshCounts();
    }, [refreshCounts]),
  );

  useEffect(() => {
    void refreshCounts();
  }, [subTab, refreshCounts]);

  const subTabs: { id: VerifySubTab; label: string; count: number }[] = [
    { id: 'companies', label: t('adminPanel.verifySubTabCompanies'), count: companyCount },
    { id: 'drivers', label: t('adminPanel.verifySubTabDrivers'), count: driverCount },
    { id: 'vehicles', label: t('adminPanel.verifySubTabVehicles'), count: vehicleCount },
    { id: 'photos', label: t('adminPanel.verifySubTabPhotos'), count: 0 },
  ];

  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.subTabRow}
        style={styles.subTabWrap}
      >
        {subTabs.map((tab) => {
          const active = subTab === tab.id;
          return (
            <Pressable
              key={tab.id}
              onPress={() => {
                setSubTab(tab.id);
                setSearchQuery('');
              }}
              style={({ pressed }) => [
                styles.subTabChip,
                active && styles.subTabChipActive,
                pressed && styles.subTabChipPressed,
              ]}
            >
              <Text style={[styles.subTabText, active && styles.subTabTextActive]}>
                {tab.label}
                {tab.count > 0 ? ` (${tab.count})` : ''}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <AdminSearchInput value={searchQuery} onChangeText={setSearchQuery} />

      {/* `key` matters: both branches render the same component, so without it
          React reuses one instance across the switch and a slow fetch from the
          tab you just left can land in the tab you are now looking at — with
          its Approve buttons pointing at the wrong rows. */}
      {subTab === 'companies' ? (
        <AdminVerifySection
          key="company"
          role="company"
          searchQuery={searchQuery}
          onQueueCountChange={setCompanyCount}
        />
      ) : subTab === 'drivers' ? (
        <AdminVerifySection
          key="driver"
          role="driver"
          searchQuery={searchQuery}
          onQueueCountChange={setDriverCount}
        />
      ) : subTab === 'vehicles' ? (
        <AdminVehicleVerifySection searchQuery={searchQuery} onQueueCountChange={setVehicleCount} />
      ) : (
        <AdminVehiclePhotoAuditSection searchQuery={searchQuery} />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  subTabWrap: {
    flexGrow: 0,
    marginBottom: SPACING.md,
  },
  subTabRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    paddingRight: SPACING.lg,
  },
  subTabChip: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: RADIUS.button,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  subTabChipActive: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.gold,
  },
  subTabChipPressed: { opacity: 0.88 },
  subTabText: {
    color: COLORS.textSecondary,
    fontWeight: '700',
    fontSize: 13,
  },
  subTabTextActive: {
    color: COLORS.text,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.button,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.md,
  },
  searchIcon: {
    marginRight: SPACING.sm,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    color: COLORS.text,
    fontSize: 15,
  },
});
