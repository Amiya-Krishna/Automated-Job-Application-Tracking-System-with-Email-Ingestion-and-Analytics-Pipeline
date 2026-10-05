import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { FormTextInput } from '@/components/form-text-input';
import { ThemedText } from '@/components/themed-text';
import { Layout, Radius } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/types/api';
import type { LoginRole } from '@/types/auth';
import { loginSchema, type LoginFormValues } from '@/utils/auth-validation';

export default function LoginScreen() {
  const { login, sessionNotice, clearSessionNotice } = useAuth();
  const theme = useTheme();
  const params = useLocalSearchParams<{ registeredEmail?: string; role?: string }>();
  // Only "admin" selects the admin door; anything else (including a missing param) is the user door.
  const role: LoginRole = params.role === 'admin' ? 'admin' : 'user';
  const isAdminLogin = role === 'admin';
  // Pre-filled when the server ended the session (expired/revoked) so the user knows why they are here.
  const [formError, setFormError] = useState<string | null>(sessionNotice);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: params.registeredEmail ?? '', password: '' },
  });

  const onSubmit = async (values: LoginFormValues) => {
    setFormError(null);
    clearSessionNotice();
    try {
      // `role` is only the door the person chose; the server verifies it against the account's
      // real role and refuses admin sign-in for non-admins.
      await login({ ...values, role });
      // No explicit navigation call: the root layout's Stack.Protected guards switch from the
      // (auth) group to (drawer) once auth status flips to 'authenticated'.
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: theme.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Link href="/role" style={styles.back} accessibilityRole="link" accessibilityLabel="Change sign-in type">
            <ThemedText type="smallBold" themeColor="tint">
              ← Change role
            </ThemedText>
          </Link>

          <View style={styles.header}>
            <View style={[styles.rolePill, { backgroundColor: isAdminLogin ? '#FFE4E6' : theme.backgroundSelected }]}>
              <ThemedText type="caption" style={{ color: isAdminLogin ? '#BE123C' : theme.tint, fontWeight: '700' }}>
                {isAdminLogin ? 'ADMIN SIGN-IN' : 'USER SIGN-IN'}
              </ThemedText>
            </View>
            <ThemedText type="title" style={styles.title}>
              {isAdminLogin ? 'Administrator access' : 'Welcome back'}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {isAdminLogin ? 'Only accounts with the administrator role can sign in here.' : 'Sign in to keep tracking your applications.'}
            </ThemedText>
          </View>

          {formError ? (
            <View accessibilityRole="alert" style={[styles.errorBanner, { borderColor: theme.danger }]}>
              <ThemedText type="small" themeColor="danger">
                {formError}
              </ThemedText>
              {isAdminLogin && formError.toLowerCase().includes('administrator') ? (
                <Link href={{ pathname: '/login', params: { role: 'user' } }}>
                  <ThemedText type="smallBold" themeColor="tint">
                    Go to User sign-in
                  </ThemedText>
                </Link>
              ) : null}
            </View>
          ) : null}

          <View style={styles.form}>
            <Controller
              control={control}
              name="email"
              render={({ field: { onChange, onBlur, value } }) => (
                <FormTextInput
                  label="Email address"
                  placeholder="you@example.com"
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  autoComplete="email"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors.email?.message}
                />
              )}
            />

            <Controller
              control={control}
              name="password"
              render={({ field: { onChange, onBlur, value } }) => (
                <FormTextInput
                  label="Password"
                  placeholder="Your password"
                  secureTextEntry
                  textContentType="password"
                  autoComplete="current-password"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors.password?.message}
                />
              )}
            />

            <Link href="/forgot-password" style={styles.forgot}>
              <ThemedText type="smallBold" themeColor="tint">
                Forgot password?
              </ThemedText>
            </Link>

            <Button
              fullWidth
              label={isAdminLogin ? 'Sign in as Admin' : 'Sign in'}
              loading={isSubmitting}
              onPress={handleSubmit(onSubmit)}
            />
          </View>

          {isAdminLogin ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
              Admin accounts are granted by an existing administrator and cannot be created here.
            </ThemedText>
          ) : (
            <View style={styles.footer}>
              <ThemedText type="small" themeColor="textSecondary">
                Don&apos;t have an account?{' '}
              </ThemedText>
              <Link href="/register">
                <ThemedText type="smallBold" themeColor="tint">
                  Create one
                </ThemedText>
              </Link>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: Layout.gutter, paddingVertical: 24, gap: 24 },
  back: { alignSelf: 'flex-start', minHeight: 44, paddingVertical: 12 },
  header: { gap: 8 },
  rolePill: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.pill },
  title: { fontSize: 30, lineHeight: 36 },
  form: { gap: 16 },
  errorBanner: { borderWidth: 1, borderRadius: Radius.md, padding: 14, gap: 6 },
  forgot: { alignSelf: 'flex-end', minHeight: 36, paddingVertical: 6 },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' },
  center: { textAlign: 'center' },
});
