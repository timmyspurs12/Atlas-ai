import { useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, AtSign, Check, LockKeyhole, UserRound } from 'lucide-react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AtlasText } from '@/components/ui/AtlasText';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { clearAuthError, registerUser } from '@/features/auth/store/auth-slice';
import type { RootStackParamList } from '@/navigation/types';
import { palette, radii, spacing } from '@/shared/config/theme';
import { useAppDispatch, useAppSelector } from '@/shared/hooks/redux';
import { useAtlasTheme } from '@/shared/hooks/use-atlas-theme';

const schema = z.object({
  displayName: z.string().trim().min(2, 'Enter your name').max(60),
  email: z.email('Enter a valid email address'),
  password: z
    .string()
    .min(12, 'Use at least 12 characters')
    .regex(/[a-z]/, 'Add a lowercase letter')
    .regex(/[A-Z]/, 'Add an uppercase letter')
    .regex(/[0-9]/, 'Add a number'),
  accepted: z.boolean().refine((value) => value, 'Accept the terms to continue'),
});
type FormData = z.infer<typeof schema>;
type Props = NativeStackScreenProps<RootStackParamList, 'Register'>;

export function RegisterScreen({ navigation }: Props) {
  const theme = useAtlasTheme();
  const dispatch = useAppDispatch();
  const { status, error } = useAppSelector((state) => state.auth);
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { displayName: '', email: '', password: '', accepted: false },
  });
  const password = useWatch({ control, name: 'password' });
  const strength = useMemo(
    () => [password.length >= 12, /[A-Z]/.test(password), /[0-9]/.test(password)].filter(Boolean).length,
    [password],
  );
  useEffect(() => () => {
    dispatch(clearAuthError());
  }, [dispatch]);

  return (
    <Screen contentStyle={styles.content}>
      <IconButton icon={ArrowLeft} label="Back" onPress={() => navigation.goBack()} style={styles.back} />
      <View style={styles.heading}>
        <AtlasText variant="h1">Create your Atlas</AtlasText>
        <AtlasText color={theme.colors.textMuted}>
          Start a private circle for the people who matter.
        </AtlasText>
      </View>
      <View style={styles.form}>
        <Controller
          control={control}
          name="displayName"
          render={({ field: { onBlur, onChange, value } }) => (
            <TextField
              label="Your name"
              icon={UserRound}
              autoComplete="name"
              placeholder="Maya Okafor"
              value={value}
              onBlur={onBlur}
              onChangeText={onChange}
              error={errors.displayName?.message}
            />
          )}
        />
        <Controller
          control={control}
          name="email"
          render={({ field: { onBlur, onChange, value } }) => (
            <TextField
              label="Email"
              icon={AtSign}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              placeholder="you@example.com"
              value={value}
              onBlur={onBlur}
              onChangeText={onChange}
              error={errors.email?.message}
            />
          )}
        />
        <Controller
          control={control}
          name="password"
          render={({ field: { onBlur, onChange, value } }) => (
            <TextField
              label="Password"
              icon={LockKeyhole}
              autoComplete="new-password"
              placeholder="At least 12 characters"
              secureTextEntry
              value={value}
              onBlur={onBlur}
              onChangeText={onChange}
              error={errors.password?.message}
            />
          )}
        />
        <View style={styles.strengthRow}>
          {[0, 1, 2].map((index) => (
            <View
              key={index}
              style={[
                styles.strengthBar,
                { backgroundColor: index < strength ? palette.teal : theme.colors.border },
              ]}
            />
          ))}
          <AtlasText variant="micro" color={strength === 3 ? palette.teal : theme.colors.textMuted}>
            {strength === 3 ? 'STRONG' : 'BUILDING STRENGTH'}
          </AtlasText>
        </View>
        <Controller
          control={control}
          name="accepted"
          render={({ field: { onChange, value } }) => (
            <View>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: value }}
                onPress={() => onChange(!value)}
                style={styles.termsRow}
              >
                <View
                  style={[
                    styles.checkbox,
                    {
                      backgroundColor: value ? palette.blue : 'transparent',
                      borderColor: value ? palette.blue : theme.colors.border,
                    },
                  ]}
                >
                  {value ? <Check size={14} color={palette.white} strokeWidth={3} /> : null}
                </View>
                <AtlasText variant="caption" color={theme.colors.textMuted} style={styles.termsText}>
                  I agree to the Terms of Service and Privacy Policy. I understand location sharing is
                  voluntary and revocable.
                </AtlasText>
              </Pressable>
              {errors.accepted ? (
                <AtlasText variant="caption" color={palette.red} style={styles.termsError}>
                  {errors.accepted.message}
                </AtlasText>
              ) : null}
            </View>
          )}
        />
        {error ? (
          <View style={styles.error} accessibilityRole="alert">
            <AtlasText variant="caption" color={palette.red}>
              {error}
            </AtlasText>
          </View>
        ) : null}
        <Button
          label="Create account"
          loading={status === 'authenticating'}
          onPress={() =>
            void handleSubmit(({ displayName, email, password }) =>
              dispatch(registerUser({ displayName, email, password })),
            )()
          }
        />
      </View>
      <View style={styles.footer}>
        <AtlasText color={theme.colors.textMuted}>Already a member?</AtlasText>
        <Pressable onPress={() => navigation.navigate('Login')} accessibilityRole="button">
          <AtlasText variant="label" color={palette.blue}>
            Sign in
          </AtlasText>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.md },
  back: { alignSelf: 'flex-start' },
  heading: { gap: spacing.xs, marginTop: spacing.xxl },
  form: { gap: spacing.md, marginTop: spacing.xl },
  strengthRow: { alignItems: 'center', flexDirection: 'row', gap: 5, marginTop: -7 },
  strengthBar: { borderRadius: 3, flex: 1, height: 4 },
  termsRow: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.sm },
  checkbox: {
    alignItems: 'center',
    borderRadius: 6,
    borderWidth: 1.5,
    height: 22,
    justifyContent: 'center',
    marginTop: 1,
    width: 22,
  },
  termsText: { flex: 1 },
  termsError: { marginLeft: 34, marginTop: 4 },
  error: { backgroundColor: 'rgba(239,68,68,0.08)', borderRadius: radii.sm, padding: spacing.sm },
  footer: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
    paddingTop: spacing.xxl,
  },
});
