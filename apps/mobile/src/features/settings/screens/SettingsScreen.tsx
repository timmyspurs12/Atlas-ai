import { Alert, Pressable, StyleSheet, Switch, View } from 'react-native';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import {
  Bell,
  ChevronRight,
  CircleHelp,
  CloudDownload,
  Crown,
  Fingerprint,
  LockKeyhole,
  LogOut,
  MapPinned,
  Moon,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Trash2,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Avatar } from '@/components/ui/Avatar';
import { AtlasText } from '@/components/ui/AtlasText';
import { Card } from '@/components/ui/Card';
import { Pill } from '@/components/ui/Pill';
import { Screen } from '@/components/ui/Screen';
import { logoutUser } from '@/features/auth/store/auth-slice';
import type { RootStackParamList } from '@/navigation/types';
import { apiRequest } from '@/shared/api/api-client';
import { palette, spacing } from '@/shared/config/theme';
import { useAppDispatch, useAppSelector } from '@/shared/hooks/redux';
import { useAtlasTheme } from '@/shared/hooks/use-atlas-theme';
import { useUiStore } from '@/shared/store/ui-store';

interface RowProps {
  icon: LucideIcon;
  iconColor: string;
  label: string;
  description?: string;
  onPress?: () => void;
  trailing?: React.ReactNode;
  danger?: boolean;
}

function SettingRow({ icon: Icon, iconColor, label, description, onPress, trailing, danger }: RowProps) {
  const theme = useAtlasTheme();
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      onPress={onPress}
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.65 : 1 }]}
    >
      <View style={[styles.rowIcon, { backgroundColor: `${iconColor}16` }]}><Icon size={19} color={iconColor} /></View>
      <View style={styles.rowCopy}>
        <AtlasText variant="label" color={danger ? palette.red : theme.colors.text}>{label}</AtlasText>
        {description ? <AtlasText variant="caption" color={theme.colors.textMuted}>{description}</AtlasText> : null}
      </View>
      {trailing ?? <ChevronRight size={18} color={theme.colors.textMuted} />}
    </Pressable>
  );
}

export function SettingsScreen() {
  const theme = useAtlasTheme();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const dispatch = useAppDispatch();
  const session = useAppSelector((state) => state.auth.session);
  const mode = useAppSelector((state) => state.auth.mode);
  const preference = useUiStore((state) => state.themePreference);
  const setTheme = useUiStore((state) => state.setThemePreference);
  const darkEnabled = preference === 'dark' || (preference === 'system' && theme.dark);

  const exportData = async (): Promise<void> => {
    if (mode === 'demo') {
      Alert.alert('Demo export ready', 'A production export includes your profile, permissions, trip history, and audit records.');
      return;
    }
    await apiRequest('/users/me/export');
    Alert.alert('Export ready', 'Your portable Atlas AI data export is ready to save.');
  };

  const confirmDeletion = (): void => {
    Alert.alert(
      'Delete your Atlas AI account?',
      'Sharing stops immediately. Your account enters a 30-day deletion window before data is anonymised or removed according to retention law.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Schedule deletion',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              if (mode === 'live') await apiRequest('/users/me', { method: 'DELETE' });
              await dispatch(logoutUser());
            })();
          },
        },
      ],
    );
  };

  return (
    <Screen contentStyle={styles.content}>
      <AtlasText variant="h1">Settings</AtlasText>

      <Card elevated style={styles.profileCard}>
        <Avatar name={session?.user.displayName ?? 'Atlas member'} color={palette.blue} size={58} online />
        <View style={styles.profileCopy}>
          <AtlasText variant="h3">{session?.user.displayName ?? 'Atlas member'}</AtlasText>
          <AtlasText variant="caption" color={theme.colors.textMuted}>@{session?.user.handle ?? 'member'}</AtlasText>
          <View style={styles.verified}><ShieldCheck size={13} color={palette.teal} /><AtlasText variant="micro" color={palette.teal}>VERIFIED ACCOUNT</AtlasText></View>
        </View>
        <ChevronRight size={20} color={theme.colors.textMuted} />
      </Card>

      <Card style={styles.planCard}>
        <View style={styles.crown}><Crown size={21} color={palette.amber} /></View>
        <View style={styles.rowCopy}>
          <View style={styles.planTitle}><AtlasText variant="h3">Atlas Family</AtlasText><Pill label="14 DAYS LEFT" color={palette.blue} backgroundColor="rgba(37,99,235,0.1)" /></View>
          <AtlasText variant="caption" color={theme.colors.textMuted}>Unlimited history, AI reports, and 20 trusted people.</AtlasText>
        </View>
        <ChevronRight size={19} color={theme.colors.textMuted} />
      </Card>

      <View style={styles.group}>
        <AtlasText variant="micro" color={theme.colors.textMuted}>PRIVACY & SAFETY</AtlasText>
        <Card padded={false}>
          <SettingRow icon={ShieldCheck} iconColor={palette.teal} label="Privacy controls" description="Sharing defaults and discoverability" />
          <View style={[styles.separator, { backgroundColor: theme.colors.border }]} />
          <SettingRow icon={MapPinned} iconColor={palette.blue} label="Places & geofences" description="Home, office, school, and custom zones" onPress={() => navigation.navigate('Geofences')} />
          <View style={[styles.separator, { backgroundColor: theme.colors.border }]} />
          <SettingRow icon={Fingerprint} iconColor="#8B5CF6" label="Emergency contacts" description="Verified contacts for SOS alerts" onPress={() => navigation.navigate('Safety')} />
        </Card>
      </View>

      <View style={styles.group}>
        <AtlasText variant="micro" color={theme.colors.textMuted}>APP EXPERIENCE</AtlasText>
        <Card padded={false}>
          <SettingRow icon={Bell} iconColor={palette.amber} label="Notifications" description="Alerts, messages, and reports" />
          <View style={[styles.separator, { backgroundColor: theme.colors.border }]} />
          <SettingRow
            icon={Moon}
            iconColor={palette.blue}
            label="Dark mode"
            description={preference === 'system' ? 'Following your device' : darkEnabled ? 'Always on' : 'Always off'}
            trailing={<Switch value={darkEnabled} onValueChange={(value) => setTheme(value ? 'dark' : 'light')} trackColor={{ false: theme.colors.border, true: palette.blue }} />}
          />
          <View style={[styles.separator, { backgroundColor: theme.colors.border }]} />
          <SettingRow icon={Sparkles} iconColor="#8B5CF6" label="AI preferences" description="Insight controls and data permissions" />
        </Card>
      </View>

      <View style={styles.group}>
        <AtlasText variant="micro" color={theme.colors.textMuted}>ACCOUNT & DATA</AtlasText>
        <Card padded={false}>
          <SettingRow icon={Smartphone} iconColor={palette.blue} label="Active devices" description="Review and revoke sessions" />
          <View style={[styles.separator, { backgroundColor: theme.colors.border }]} />
          <SettingRow icon={CloudDownload} iconColor={palette.teal} label="Export my data" description="Download a portable copy" onPress={() => void exportData()} />
          <View style={[styles.separator, { backgroundColor: theme.colors.border }]} />
          <SettingRow icon={LockKeyhole} iconColor={palette.slate500} label="Security" description="Password and sign-in methods" />
        </Card>
      </View>

      <View style={styles.group}>
        <Card padded={false}>
          <SettingRow icon={LogOut} iconColor={palette.red} label="Sign out" onPress={() => void dispatch(logoutUser())} danger />
          <View style={[styles.separator, { backgroundColor: theme.colors.border }]} />
          <SettingRow icon={Trash2} iconColor={palette.red} label="Delete account" description="Stop sharing and schedule deletion" onPress={confirmDeletion} danger />
        </Card>
      </View>

      <View style={styles.helpRow}>
        <CircleHelp size={16} color={theme.colors.textMuted} />
        <AtlasText variant="caption" color={theme.colors.textMuted}>Help · Privacy · Terms · Atlas AI v0.1.0</AtlasText>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg, paddingTop: spacing.md },
  profileCard: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  profileCopy: { flex: 1, gap: 1 },
  verified: { alignItems: 'center', flexDirection: 'row', gap: 4, marginTop: 3 },
  planCard: { alignItems: 'center', borderColor: 'rgba(245,158,11,0.22)', flexDirection: 'row', gap: spacing.sm },
  crown: { alignItems: 'center', backgroundColor: 'rgba(245,158,11,0.12)', borderRadius: 14, height: 44, justifyContent: 'center', width: 44 },
  planTitle: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  group: { gap: spacing.xs },
  row: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, minHeight: 68, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  rowIcon: { alignItems: 'center', borderRadius: 12, height: 38, justifyContent: 'center', width: 38 },
  rowCopy: { flex: 1 },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: 66 },
  helpRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs, justifyContent: 'center', paddingBottom: spacing.lg },
});
