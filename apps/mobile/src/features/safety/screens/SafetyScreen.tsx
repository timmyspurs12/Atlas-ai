import { useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { ArrowLeft, CheckCircle2, Mail, MessageSquareText, Plus, ShieldAlert, Smartphone } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { Avatar } from '@/components/ui/Avatar';
import { AtlasText } from '@/components/ui/AtlasText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { IconButton } from '@/components/ui/IconButton';
import { Screen } from '@/components/ui/Screen';
import { SosSheet } from '../components/SosSheet';
import { palette, spacing } from '@/shared/config/theme';
import { useAtlasTheme } from '@/shared/hooks/use-atlas-theme';

export function SafetyScreen() {
  const theme = useAtlasTheme();
  const navigation = useNavigation();
  const [sos, setSos] = useState(false);
  const [sms, setSms] = useState(true);
  const [email, setEmail] = useState(true);
  return (
    <Screen contentStyle={styles.content}>
      <View style={styles.header}>
        <IconButton icon={ArrowLeft} label="Back" onPress={() => navigation.goBack()} />
        <View style={styles.flex}><AtlasText variant="h2">Safety centre</AtlasText><AtlasText variant="caption" color={theme.colors.textMuted}>Emergency contacts and SOS delivery</AtlasText></View>
      </View>

      <Card style={styles.statusCard}>
        <View style={styles.shield}><CheckCircle2 size={24} color={palette.white} /></View>
        <View style={styles.flex}><AtlasText variant="h3">Safety setup complete</AtlasText><AtlasText variant="caption" color={theme.colors.textMuted}>2 verified contacts · 3 delivery channels</AtlasText></View>
      </Card>

      <View style={styles.sectionHeader}><AtlasText variant="h3">Emergency contacts</AtlasText><Pressable><AtlasText variant="label" color={palette.blue}>Edit</AtlasText></Pressable></View>
      <Card padded={false}>
        {[
          { name: 'Sarah Chen', relation: 'Partner', color: '#8B5CF6', channel: 'Push + SMS' },
          { name: 'David Okafor', relation: 'Brother', color: palette.teal, channel: 'SMS + Email' },
        ].map((contact, index) => (
          <View key={contact.name} style={[styles.contact, index === 0 && { borderBottomColor: theme.colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
            <Avatar name={contact.name} color={contact.color} size={44} online={index === 0} />
            <View style={styles.flex}><AtlasText variant="label">{contact.name}</AtlasText><AtlasText variant="caption" color={theme.colors.textMuted}>{contact.relation} · {contact.channel}</AtlasText></View>
            <View style={styles.verified}><CheckCircle2 size={14} color={palette.teal} /><AtlasText variant="micro" color={palette.teal}>VERIFIED</AtlasText></View>
          </View>
        ))}
      </Card>
      <Button label="Add emergency contact" icon={Plus} variant="secondary" onPress={() => undefined} />

      <AtlasText variant="h3">Alert delivery</AtlasText>
      <Card padded={false}>
        <View style={styles.delivery}><View style={styles.deliveryIcon}><Smartphone size={19} color={palette.blue} /></View><View style={styles.flex}><AtlasText variant="label">Push notifications</AtlasText><AtlasText variant="caption" color={theme.colors.textMuted}>Always enabled for linked Atlas users</AtlasText></View><Switch value trackColor={{ true: palette.blue }} /></View>
        <View style={[styles.delivery, { borderTopColor: theme.colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}><View style={styles.deliveryIcon}><MessageSquareText size={19} color={palette.teal} /></View><View style={styles.flex}><AtlasText variant="label">SMS</AtlasText><AtlasText variant="caption" color={theme.colors.textMuted}>Carrier charges may apply</AtlasText></View><Switch value={sms} onValueChange={setSms} trackColor={{ false: theme.colors.border, true: palette.teal }} /></View>
        <View style={[styles.delivery, { borderTopColor: theme.colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}><View style={styles.deliveryIcon}><Mail size={19} color={palette.amber} /></View><View style={styles.flex}><AtlasText variant="label">Email</AtlasText><AtlasText variant="caption" color={theme.colors.textMuted}>Includes time-limited safety link</AtlasText></View><Switch value={email} onValueChange={setEmail} trackColor={{ false: theme.colors.border, true: palette.amber }} /></View>
      </Card>

      <Card style={styles.testCard}>
        <ShieldAlert size={22} color={palette.red} />
        <View style={styles.flex}><AtlasText variant="label">Review the SOS gesture</AtlasText><AtlasText variant="caption" color={theme.colors.textMuted}>Holding for three seconds sends a real alert. Use the interactive demo only when testing.</AtlasText></View>
      </Card>
      <Button label="Open SOS control" icon={ShieldAlert} variant="danger" onPress={() => setSos(true)} />
      <SosSheet visible={sos} onClose={() => setSos(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg, paddingTop: spacing.md },
  header: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
  statusCard: { alignItems: 'center', borderColor: 'rgba(34,197,94,0.22)', flexDirection: 'row', gap: spacing.sm },
  shield: { alignItems: 'center', backgroundColor: palette.green, borderRadius: 15, height: 46, justifyContent: 'center', width: 46 },
  sectionHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  contact: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, minHeight: 70, paddingHorizontal: spacing.md },
  verified: { alignItems: 'center', flexDirection: 'row', gap: 3 },
  delivery: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, minHeight: 70, paddingHorizontal: spacing.md },
  deliveryIcon: { alignItems: 'center', backgroundColor: 'rgba(37,99,235,0.08)', borderRadius: 12, height: 38, justifyContent: 'center', width: 38 },
  testCard: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
});
