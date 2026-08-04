import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, AtSign, LockKeyhole } from 'lucide-react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AtlasText } from '@/components/ui/AtlasText';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { SocialSignIn } from '@/features/auth/components/SocialSignIn';
import { clearAuthError, loginUser } from '@/features/auth/store/auth-slice';
import type { RootStackParamList } from '@/navigation/types';
import { palette, spacing } from '@/shared/config/theme';
import { useAppDispatch, useAppSelector } from '@/shared/hooks/redux';

const schema = z.object({
  email: z.email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
});
type FormData = z.infer<typeof schema>;
type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

export function LoginScreen({ navigation }: Props) {
  const dispatch = useAppDispatch();
  const { status, error } = useAppSelector((state) => state.auth);
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });
  useEffect(() => () => {
    dispatch(clearAuthError());
  }, [dispatch]);

  return (
    <Screen contentStyle={styles.content}>
      <IconButton icon={ArrowLeft} label="Back" onPress={() => navigation.goBack()} style={styles.back} />
      <View style={styles.heading}>
        <View style={styles.eyebrow}>
          <LockKeyhole size={14} color={palette.teal} />
          <AtlasText variant="micro" color={palette.teal}>
            SECURE SIGN IN
          </AtlasText>
        </View>
        <AtlasText variant="h1">Welcome back</AtlasText>
        <AtlasText color={palette.slate500}>
          Sign in to reconnect with your trusted circle.
        </AtlasText>
      </View>

      <View style={styles.form}>
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
              autoComplete="current-password"
              placeholder="Your password"
              secureTextEntry
              value={value}
              onBlur={onBlur}
              onChangeText={onChange}
              error={errors.password?.message}
              onSubmitEditing={() => void handleSubmit((data) => dispatch(loginUser(data)))()}
            />
          )}
        />
        <Pressable
          accessibilityRole="button"
          onPress={() => navigation.navigate('ForgotPassword')}
          style={styles.forgot}
        >
          <AtlasText variant="label" color={palette.blue}>
            Forgot password?
          </AtlasText>
        </Pressable>
        {error ? (
          <View style={styles.error} accessibilityRole="alert">
            <AtlasText variant="caption" color={palette.red}>
              {error}
            </AtlasText>
          </View>
        ) : null}
        <Button
          label="Sign in"
          loading={status === 'authenticating'}
          onPress={() => void handleSubmit((data) => dispatch(loginUser(data)))()}
        />
        <SocialSignIn />
      </View>

      <View style={styles.footer}>
        <AtlasText color={palette.slate500}>New to Atlas AI?</AtlasText>
        <Pressable onPress={() => navigation.navigate('Register')} accessibilityRole="button">
          <AtlasText variant="label" color={palette.blue}>
            Create an account
          </AtlasText>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.md },
  back: { alignSelf: 'flex-start' },
  heading: { gap: spacing.xs, marginTop: spacing.xxxl },
  eyebrow: { alignItems: 'center', flexDirection: 'row', gap: 6, marginBottom: spacing.xs },
  form: { gap: spacing.md, marginTop: spacing.xxl },
  forgot: { alignSelf: 'flex-end', marginTop: -4, paddingVertical: 4 },
  error: {
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderRadius: 12,
    padding: spacing.sm,
  },
  footer: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
    marginTop: 'auto',
    paddingTop: spacing.xxxl,
  },
});
