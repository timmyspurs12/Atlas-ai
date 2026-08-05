import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { Chrome, Apple } from 'lucide-react-native';
import { AtlasText } from '@/components/ui/AtlasText';
import { socialLoginUser } from '../store/auth-slice';
import { runtime } from '@/shared/config/runtime';
import { palette, radii, spacing } from '@/shared/config/theme';
import { useAppDispatch } from '@/shared/hooks/redux';
import { useAtlasTheme } from '@/shared/hooks/use-atlas-theme';

void WebBrowser.maybeCompleteAuthSession();

function GoogleButton() {
  const theme = useAtlasTheme();
  const dispatch = useAppDispatch();
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    iosClientId: runtime.googleIosClientId,
    androidClientId: runtime.googleAndroidClientId,
    webClientId: runtime.googleWebClientId,
    selectAccount: true,
  });
  useEffect(() => {
    if (response?.type !== 'success') return;
    const idToken = response.params.id_token ?? response.authentication?.idToken;
    if (idToken) void dispatch(socialLoginUser({ provider: 'GOOGLE', idToken }));
  }, [dispatch, response]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Continue with Google"
      disabled={!request}
      onPress={() => void promptAsync()}
      style={({ pressed }) => [
        styles.socialButton,
        {
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <Chrome size={19} color="#4285F4" />
      <AtlasText variant="label">Google</AtlasText>
    </Pressable>
  );
}

export function SocialSignIn() {
  const theme = useAtlasTheme();
  const dispatch = useAppDispatch();
  const [appleAvailable, setAppleAvailable] = useState(false);
  const googleConfigured = Boolean(
    Platform.select({
      ios: runtime.googleIosClientId,
      android: runtime.googleAndroidClientId,
      default: runtime.googleWebClientId,
    }),
  );
  useEffect(() => {
    if (Platform.OS === 'ios') {
      void AppleAuthentication.isAvailableAsync().then(setAppleAvailable);
    }
  }, []);

  const signInWithApple = async (): Promise<void> => {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
    if (!credential.identityToken) return;
    const displayName = [credential.fullName?.givenName, credential.fullName?.familyName]
      .filter(Boolean)
      .join(' ');
    await dispatch(
      socialLoginUser({ provider: 'APPLE', idToken: credential.identityToken, displayName }),
    );
  };

  if (!googleConfigured && !appleAvailable) return null;
  return (
    <View style={styles.wrap}>
      <View style={styles.dividerRow}>
        <View style={[styles.line, { backgroundColor: theme.colors.border }]} />
        <AtlasText variant="micro" color={theme.colors.textMuted}>
          OR CONTINUE WITH
        </AtlasText>
        <View style={[styles.line, { backgroundColor: theme.colors.border }]} />
      </View>
      <View style={styles.buttons}>
        {googleConfigured ? <GoogleButton /> : null}
        {appleAvailable ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Continue with Apple"
            onPress={() => void signInWithApple()}
            style={({ pressed }) => [
              styles.socialButton,
              {
                backgroundColor: theme.dark ? palette.white : palette.ink,
                opacity: pressed ? 0.75 : 1,
              },
            ]}
          >
            <Apple
              size={19}
              color={theme.dark ? palette.ink : palette.white}
              fill={theme.dark ? palette.ink : palette.white}
            />
            <AtlasText variant="label" color={theme.dark ? palette.ink : palette.white}>
              Apple
            </AtlasText>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  dividerRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  line: { flex: 1, height: StyleSheet.hairlineWidth },
  buttons: { flexDirection: 'row', gap: spacing.sm },
  socialButton: {
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: spacing.md,
  },
});
