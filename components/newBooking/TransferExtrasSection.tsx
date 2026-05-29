import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AuthInput } from '../AuthInput';
import { PickupSignLogoField } from '../PickupSignLogoField';
import type { PickupSignLogoFile } from '../../lib/bookings';
import type { CommissionMode } from '../../lib/bookingCompose';

type Props = {
  meetGreet: boolean;
  onMeetGreetChange: (v: boolean) => void;
  signText: string;
  onSignTextChange: (v: string) => void;
  passengerName: string;
  onPassengerNameChange: (v: string) => void;
  passengerPhone: string;
  onPassengerPhoneChange: (v: string) => void;
  pickupSignLogo: PickupSignLogoFile | null;
  onPickupSignLogoChange: (f: PickupSignLogoFile | null) => void;
  commissionStr: string;
  onCommissionStrChange: (v: string) => void;
  commissionMode: CommissionMode;
  onCommissionModeChange: (m: CommissionMode) => void;
  showCommission: boolean;
  submitting: boolean;
  styles: Record<string, object>;
};

export function TransferExtrasSection({
  meetGreet,
  onMeetGreetChange,
  signText,
  onSignTextChange,
  passengerName,
  onPassengerNameChange,
  passengerPhone,
  onPassengerPhoneChange,
  pickupSignLogo,
  onPickupSignLogoChange,
  commissionStr,
  onCommissionStrChange,
  commissionMode,
  onCommissionModeChange,
  showCommission,
  submitting,
  styles,
}: Props) {
  const { t } = useTranslation();

  return (
    <View>
      <View style={styles.compactRow as object}>
        <AuthInput
          label={t('newBooking.form.passengerName')}
          value={passengerName}
          onChangeText={onPassengerNameChange}
        />
        <AuthInput
          label={t('newBooking.form.phone')}
          value={passengerPhone}
          onChangeText={onPassengerPhoneChange}
          keyboardType="phone-pad"
        />
      </View>
      <Pressable
        onPress={() => onMeetGreetChange(!meetGreet)}
        style={[
          styles.meetToggleCompact as object,
          meetGreet ? styles.meetToggleOn : styles.meetToggleOff,
        ]}
      >
        <Text style={meetGreet ? styles.meetToggleTextOn : styles.meetToggleTextOff}>
          {t('newBooking.form.meetGreet')}
        </Text>
      </Pressable>
      {meetGreet ? (
        <AuthInput
          label={t('newBooking.form.signText')}
          value={signText}
          onChangeText={onSignTextChange}
          placeholder={t('newBooking.form.placeholders.signName')}
        />
      ) : null}
      {meetGreet ? (
        <Text style={styles.orDivider as object}>{t('newBooking.pickupSignLogo.orAnd')}</Text>
      ) : null}
      <PickupSignLogoField
        value={pickupSignLogo}
        onChange={onPickupSignLogoChange}
        disabled={submitting}
      />
      {showCommission ? (
        <>
          <Text style={styles.sectionHeader as object}>{t('newBooking.form.commission')}</Text>
          <View style={styles.chips as object}>
            <Pressable
              onPress={() => onCommissionModeChange('gel')}
              style={[styles.chip as object, commissionMode === 'gel' && styles.chipActive]}
            >
              <Text
                style={[
                  styles.chipText as object,
                  commissionMode === 'gel' && styles.chipTextActive,
                ]}
              >
                ₾
              </Text>
            </Pressable>
            <Pressable
              onPress={() => onCommissionModeChange('percent')}
              style={[styles.chip as object, commissionMode === 'percent' && styles.chipActive]}
            >
              <Text
                style={[
                  styles.chipText as object,
                  commissionMode === 'percent' && styles.chipTextActive,
                ]}
              >
                %
              </Text>
            </Pressable>
          </View>
          <AuthInput
            label={
              commissionMode === 'gel'
                ? t('newBooking.form.commissionGel')
                : t('newBooking.form.commissionPct')
            }
            value={commissionStr}
            onChangeText={onCommissionStrChange}
            keyboardType="decimal-pad"
            placeholder={
              commissionMode === 'gel'
                ? t('newBooking.form.placeholders.zero')
                : t('newBooking.form.placeholders.commissionPctExample')
            }
          />
        </>
      ) : null}
    </View>
  );
}
