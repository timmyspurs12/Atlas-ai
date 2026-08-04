import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, AtSign, MailCheck } from 'lucide-react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { apiRequest, AtlasApiError } from '@/shared/api/api-client';
import { AtlasText } from '@/components/ui/AtlasText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { IconButton } from '@/components/ui/IconButton';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import type { RootStackParamList } from '@/navigation/types';
import { palette, spacing } from '@/shared/config/theme';

const schema = z.object({ email: z.email('Enter a valid email address') });
type FormData = z.infer<typeof schema>;
type Props = NativeStackScreenProps<RootStackParamList, 'ForgotPassword'>;

export function ForgotPasswordScreen({ navigation }: Props) {
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const { control, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { email: '' },
  });

  const submit = async (input: FormData): Promise<void> => {
    setLoading(true);
    setRequestError(null);
    try {
      await apiRequest('/auth/forgot-password', { method: 'POST', authenticated: false, body: input });
      setSent(true);
    } catch (error) {
      setRequestError(error instanceof AtlasApiError ? error.message : 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen contentStyle={styles.content}>
      <IconButton icon={ArrowLeft} label="Back" onPress={() => navigation.goBack()} style={styles.back} />
      <View style={styles.heading}>
        <AtlasText variant="h1">Reset your password</AtlasText>
        <AtlasText color={palette.slate500}>
          We’ll send a private, time-limited reset link if the account exists.
        </AtlasText>
      </View>
      {sent ? (
        <Card style={styles.confirmation}>
          <View style={styles.confirmIcon}>
            <MailCheck size={28} color={palette.teal} />
          </View>
          <AtlasText variant="h3">Check your inbox</AtlasText>
          <AtlasText color={palette.slate500} align="center">
            For your privacy, we show the same confirmation for every email address.
          </AtlasText>
          <Button label="Back to sign in" onPress={() => navigation.navigate('Login')} />
        </Card>
      ) : (
        <View style={styles.form}>
          <Controller
            control={control}
            name="email"
            render={({ field: { onBlur, onChange, value } }) => (
              <TextField
                label="Account email"
                icon={AtSign}
                autoCapitalize="none"
                keyboardType="email-address"
                placeholder="you@example.com"
                value={value}
                onBlur={onBlur}
                onChangeText={onChange}
                error={errors.email?.message}
              />
            )}
          />
          {requestError ? <AtlasText color={palette.red}>{requestError}</AtlasText> : null}
          <Button label="Send reset link" loading={loading} onPress={() => void handleSubmit(submit)()} />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.md },
  back: { alignSelf: 'flex-start' },
  heading: { gap: spacing.xs, marginTop: spacing.xxxl },
  form: { gap: spacing.lg, marginTop: spacing.xxl },
  confirmation: { alignItems: 'center', gap: spacing.md, marginTop: spacing.xxl, padding: spacing.xl },
  confirmIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(20,184,166,0.12)',
    borderRadius: 24,
    height: 54,
    justifyContent: 'center',
    width: 54,
  },
});
