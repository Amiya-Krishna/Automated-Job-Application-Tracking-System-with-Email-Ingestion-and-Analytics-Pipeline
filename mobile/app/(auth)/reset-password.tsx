import { zodResolver } from '@hookform/resolvers/zod';
import { Link, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FormTextInput } from '@/components/form-text-input';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { resetPassword } from '@/services/auth';
import { ApiError } from '@/types/api';
import { resetPasswordSchema, type ResetPasswordFormValues } from '@/utils/auth-validation';

/**
 * Token entry supports both a deep link and manual paste.
 *
 * This app requests its OWN, completely separate reset email — Web and
 * Mobile never share a link or cross over (see
 * app/(auth)/forgot-password.tsx and server/routes/authRoutes.js):
 * `POST /api/auth/forgot-password` is called with
 * `{ email, source: 'mobile', redirectUri: Linking.createURL('reset-password') }`,
 * the same mechanism Gmail OAuth's mobile flow uses, validated
 * server-side against a `mobile://`/`exp://` allow-list
 * (server/utils/mobileRedirect.js). The resulting email links straight
 * to `mobile://reset-password?token=...` — no web page, no "continue in
 * app" handoff, no mobile-browser detection anywhere in the web client.
 *
 * `useLocalSearchParams` reads the `token` Expo Router extracts from
 * that deep link, and the token field is pre-filled and read-only in
 * that case. Manual paste remains the fallback for anyone who opens
 * this screen without a token already in hand (e.g. copy-pasting it
 * from a desktop email client) — the field is only locked when a deep
 * link actually supplied one.
 */
export default function ResetPasswordScreen() {
  const theme = useTheme();
  const { token: deepLinkToken } = useLocalSearchParams<{ token?: string }>();
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token: deepLinkToken ?? '', password: '', confirmPassword: '' },
  });

  // Covers the case where this screen was already mounted (e.g. the user
  // navigated here manually) and a deep link arrives afterward — reset()
  // only runs when there's actually a token to apply, so it never wipes
  // out password/confirmPassword the user has already started typing.
  useEffect(() => {
    if (deepLinkToken) {
      reset((current) => ({ ...current, token: deepLinkToken }));
    }
  }, [deepLinkToken, reset]);

  const onSubmit = async (values: ResetPasswordFormValues) => {
    setFormError(null);
    try {
      const { message } = await resetPassword({ token: values.token.trim(), password: values.password });
      setSuccessMessage(message);
    } catch (err) {
      // Covers "Reset link is invalid or has expired" (400, from either
      // a bad token or the 30-minute window passing) as well as network/
      // 5xx failures — ApiError.message is already user-facing.
      setFormError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <SafeAreaView style={styles.safeArea}>
          <ThemedView style={styles.header}>
            <ThemedText type="title" style={styles.title}>
              Set a new password
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {deepLinkToken
                ? "We've filled in your reset code from the link you tapped — just choose a new password."
                : 'Paste the reset code from the email we sent you, then choose a new password.'}
            </ThemedText>
          </ThemedView>

          {successMessage ? (
            <ThemedView style={styles.form}>
              <ThemedView style={[styles.successBanner, { borderColor: theme.tint }]}>
                <ThemedText type="small" themeColor="tint">
                  {successMessage}
                </ThemedText>
              </ThemedView>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.replace('/login')}
                style={[styles.submitButton, { backgroundColor: theme.tint }]}>
                <ThemedText type="smallBold" style={styles.submitButtonText}>
                  Back to login
                </ThemedText>
              </Pressable>
            </ThemedView>
          ) : (
            <>
              {formError ? (
                <ThemedView style={[styles.errorBanner, { borderColor: theme.danger }]}>
                  <ThemedText type="small" themeColor="danger">
                    {formError}
                  </ThemedText>
                </ThemedView>
              ) : null}

              <ThemedView style={styles.form}>
                <Controller
                  control={control}
                  name="token"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <FormTextInput
                      label="Reset code"
                      placeholder="Paste the code from your email"
                      autoCapitalize="none"
                      autoCorrect={false}
                      editable={!deepLinkToken}
                      style={deepLinkToken ? styles.readOnlyInput : undefined}
                      value={value}
                      onChangeText={onChange}
                      onBlur={onBlur}
                      error={errors.token?.message}
                    />
                  )}
                />

                <Controller
                  control={control}
                  name="password"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <FormTextInput
                      label="New password"
                      placeholder="Create a new password"
                      secureTextEntry
                      textContentType="newPassword"
                      value={value}
                      onChangeText={onChange}
                      onBlur={onBlur}
                      error={errors.password?.message}
                    />
                  )}
                />

                <Controller
                  control={control}
                  name="confirmPassword"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <FormTextInput
                      label="Confirm new password"
                      placeholder="Re-enter your new password"
                      secureTextEntry
                      textContentType="newPassword"
                      value={value}
                      onChangeText={onChange}
                      onBlur={onBlur}
                      error={errors.confirmPassword?.message}
                    />
                  )}
                />

                <Pressable
                  accessibilityRole="button"
                  disabled={isSubmitting}
                  onPress={handleSubmit(onSubmit)}
                  style={[styles.submitButton, { backgroundColor: theme.tint, opacity: isSubmitting ? 0.7 : 1 }]}>
                  <ThemedText type="smallBold" style={styles.submitButtonText}>
                    {isSubmitting ? 'Saving…' : 'Set new password'}
                  </ThemedText>
                </Pressable>
              </ThemedView>
            </>
          )}

          <ThemedView style={styles.footer}>
            <ThemedText type="small" themeColor="textSecondary">
              Need a new code?{' '}
            </ThemedText>
            <Link href="/forgot-password">
              <ThemedText type="small" themeColor="tint">
                Request another
              </ThemedText>
            </Link>
          </ThemedView>
        </SafeAreaView>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
  },
  safeArea: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.four,
  },
  header: {
    gap: Spacing.one,
    backgroundColor: 'transparent',
  },
  title: {
    fontSize: 32,
    lineHeight: 38,
  },
  form: {
    gap: Spacing.three,
    backgroundColor: 'transparent',
  },
  errorBanner: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    padding: Spacing.three,
    backgroundColor: 'transparent',
  },
  readOnlyInput: {
    opacity: 0.6,
  },
  successBanner: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    padding: Spacing.three,
    backgroundColor: 'transparent',
  },
  submitButton: {
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  submitButtonText: {
    color: '#ffffff',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
});
