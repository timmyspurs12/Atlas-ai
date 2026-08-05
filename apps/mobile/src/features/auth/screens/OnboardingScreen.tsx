import { Image, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';
import { ArrowRight, LockKeyhole, MapPin, ShieldCheck, Sparkles } from 'lucide-react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import atlasIcon from '../../../../assets/icon.png';
import { AtlasText } from '@/components/ui/AtlasText';
import { Button } from '@/components/ui/Button';
import { enterDemo } from '@/features/auth/store/auth-slice';
import type { RootStackParamList } from '@/navigation/types';
import { palette, radii, spacing } from '@/shared/config/theme';
import { runtime } from '@/shared/config/runtime';
import { useAppDispatch } from '@/shared/hooks/redux';

type Props = NativeStackScreenProps<RootStackParamList, 'Onboarding'>;

export function OnboardingScreen({ navigation }: Props) {
  const dispatch = useAppDispatch();
  const { height } = useWindowDimensions();
  const compact = height < 720;
  return (
    <LinearGradient colors={['#020617', '#0B1B3D', '#0B2E40']} style={styles.gradient}>
      <SafeAreaView style={styles.safe}>
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <Svg width="100%" height="58%" viewBox="0 0 400 500">
            <Circle cx="310" cy="88" r="150" fill="#2563EB" opacity="0.13" />
            <Circle cx="92" cy="235" r="185" fill="#14B8A6" opacity="0.08" />
            <Path
              d="M-20 338 C65 286 90 192 178 183 C278 173 286 84 430 55"
              fill="none"
              stroke="#60A5FA"
              strokeWidth="2"
              opacity="0.25"
              strokeDasharray="6 10"
            />
            <Circle cx="177" cy="183" r="7" fill="#2DD4BF" />
            <Circle cx="177" cy="183" r="16" fill="none" stroke="#2DD4BF" opacity="0.35" />
          </Svg>
        </View>

        <Animated.View entering={FadeInUp.duration(700)} style={styles.brandRow}>
          <Image source={atlasIcon} style={styles.logo} />
          <AtlasText variant="h3" color={palette.white}>
            Atlas AI
          </AtlasText>
          <View style={styles.privateBadge}>
            <LockKeyhole size={12} color="#A7F3D0" />
            <AtlasText variant="micro" color="#A7F3D0">
              PRIVATE BY DESIGN
            </AtlasText>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(180).duration(700)} style={styles.hero}>
          <View style={styles.heroIcon}>
            <MapPin color={palette.white} fill="#2563EB" size={30} strokeWidth={2.2} />
            <View style={styles.sparkle}>
              <Sparkles color="#99F6E4" size={16} />
            </View>
          </View>
          <AtlasText variant="hero" color={palette.white} style={compact && styles.compactHero}>
            Know where your people are, when it matters.
          </AtlasText>
          <AtlasText variant="body" color="#CBD5E1" style={styles.subtitle}>
            Stay close to the people you trust with consent-based live location, smarter journeys,
            and safety that respects everyone.
          </AtlasText>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(320).duration(700)} style={styles.bottom}>
          <View style={styles.consentCard}>
            <View style={styles.shieldWrap}>
              <ShieldCheck color="#5EEAD4" size={22} />
            </View>
            <View style={styles.consentCopy}>
              <AtlasText variant="label" color={palette.white}>
                You are always in control
              </AtlasText>
              <AtlasText variant="caption" color="#94A3B8">
                Sharing starts only with permission, expires automatically, and stops in one tap.
              </AtlasText>
            </View>
          </View>
          <Button
            label="Create your account"
            icon={ArrowRight}
            onPress={() => navigation.navigate('Register')}
          />
          <Button
            label="I already have an account"
            variant="secondary"
            onPress={() => navigation.navigate('Login')}
          />
          {runtime.demoMode ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Explore Atlas AI demo"
              onPress={() => dispatch(enterDemo())}
              style={styles.demoButton}
            >
              <AtlasText variant="label" color="#93C5FD">
                Explore the interactive demo
              </AtlasText>
              <ArrowRight size={16} color="#93C5FD" />
            </Pressable>
          ) : null}
          <AtlasText variant="micro" align="center" color="#64748B" style={styles.terms}>
            BY CONTINUING, YOU AGREE TO THE TERMS AND PRIVACY POLICY
          </AtlasText>
        </Animated.View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  safe: { flex: 1, paddingHorizontal: spacing.xl },
  brandRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, paddingTop: spacing.sm },
  logo: { borderRadius: 12, height: 38, width: 38 },
  privateBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(20,184,166,0.12)',
    borderColor: 'rgba(94,234,212,0.25)',
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    marginLeft: 'auto',
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  hero: { flex: 1, justifyContent: 'center', maxWidth: 410, paddingBottom: spacing.lg },
  heroIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(37,99,235,0.22)',
    borderColor: 'rgba(96,165,250,0.35)',
    borderRadius: 22,
    borderWidth: 1,
    height: 58,
    justifyContent: 'center',
    marginBottom: spacing.xl,
    width: 58,
  },
  sparkle: { position: 'absolute', right: -8, top: -8 },
  compactHero: { fontSize: 31, lineHeight: 37 },
  subtitle: { marginTop: spacing.md, maxWidth: 390 },
  bottom: { gap: spacing.sm, paddingBottom: spacing.sm },
  consentCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(15,23,42,0.58)',
    borderColor: 'rgba(148,163,184,0.18)',
    borderRadius: radii.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.xs,
    padding: spacing.md,
  },
  shieldWrap: {
    alignItems: 'center',
    backgroundColor: 'rgba(20,184,166,0.15)',
    borderRadius: 14,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  consentCopy: { flex: 1, gap: 2 },
  demoButton: {
    alignItems: 'center',
    alignSelf: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: 36,
    paddingHorizontal: spacing.md,
  },
  terms: { marginTop: 2 },
});
