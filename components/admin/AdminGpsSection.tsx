import { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { COLORS, SPACING } from '../../constants/theme';
import { adminStyles } from './adminStyles';
import { AdminGpsPanel } from './AdminGpsPanel';

export function AdminGpsSection() {
  const { t } = useTranslation();
  const [fullMapOpen, setFullMapOpen] = useState(false);

  return (
    <View>
      <AdminGpsPanel compact />

      <Pressable
        onPress={() => setFullMapOpen(true)}
        style={[adminStyles.btnGold, { marginTop: SPACING.md, alignSelf: 'flex-start' }]}
      >
        <Text style={adminStyles.btnGoldText}>{t('adminPanel.openFullMap')}</Text>
      </Pressable>

      <Modal
        visible={fullMapOpen}
        animationType="fade"
        presentationStyle="fullScreen"
        onRequestClose={() => setFullMapOpen(false)}
        statusBarTranslucent
      >
        <View style={styles.modalRoot}>
          <AdminGpsPanel
            key={fullMapOpen ? 'gps-full-open' : 'gps-full-closed'}
            fullScreen
            onClose={() => setFullMapOpen(false)}
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    backgroundColor: COLORS.background,
    ...(Platform.OS === 'web'
      ? ({
          width: '100%',
          height: '100%',
          minHeight: '100vh',
          maxHeight: '100vh',
          overflow: 'hidden',
        } as object)
      : {}),
  },
});
