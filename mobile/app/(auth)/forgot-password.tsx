import { zodResolver } from '@hookform/resolvers/zod';
import { Link, router } from 'expo-router';
import * as Linking from 'expo-linking';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FormTextInput } from '@/components/form-text-input';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { forgotPassword } from '@/services/auth';
import { ApiError } from '@/types/api';
import { forgotPasswordSchema, type ForgotPasswordFormValues } from '@/utils/auth-validation';

export default function ForgotPasswordScreen() {
  const theme = useTheme();
  const [formError, setFormError] = useState<string | null>(null);
  const [sentMessage, setSentMessage] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = async (values: ForgotPasswordFormValues) => {
    setFormError(null);
    try {
      // Ask the backend for a MOBILE-specific reset email — a completely
      // separate link from what the web app's Forgot Password page
      // requests, same mechanism as Gmail OAuth's mobile connect flow
      // (Linking.createURL(...) -> validated server-side against a
      // mobile://exp:// allow-list). This is what makes the emailed
      // link open this app's reset-password screen directly, with no
      // web page or "continue in app" handoff in between — see
      // types/auth.ts's ForgotPasswordRequest for the full contract.
      const redirectUri = Linking.createURL('reset-password');
      // The backend always returns the same generic message whether or
      // not the account exists (deliberately non-enumerating — see
      // types/auth.ts) — shown as-is rather than re-worded, so the UI
      // never implies anything about whether the email is registered.
      const { message } = await forgotPassword({ ...values, source: 'mobile', redirectUri });
      setSentMessage(message);
    } catch (err) {
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
              Forgot your password?
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Enter the email on your account and we&apos;ll send a link to reset it. The link
              expires in 30 minutes.
            </ThemedText>
          </ThemedView>

          {sentMessage ? (
            <ThemedView style={styles.form}>
              <ThemedView style={[styles.successBanner, { borderColor: theme.tint }]}>
                <ThemedText type="small" themeColor="tint">
                  {sentMessage}
                </ThemedText>
              </ThemedView>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/reset-password')}
                style={[styles.submitButton, { backgroundColor: theme.tint }]}>
                <ThemedText type="smallBold" style={styles.submitButtonText}>
                  I have my reset code
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

                <Pressable
                  accessibilityRole="button"
                  disabled={isSubmitting}
                  onPress={handleSubmit(onSubmit)}
                  style={[styles.submitButton, { backgroundColor: theme.tint, opacity: isSubmitting ? 0.7 : 1 }]}>
                  <ThemedText type="smallBold" style={styles.submitButtonText}>
                    {isSubmitting ? 'Sending…' : 'Send reset link'}
                  </ThemedText>
                </Pressable>
              </ThemedView>
            </>
          )}

          <ThemedView style={styles.footer}>
            <ThemedText type="small" themeColor="textSecondary">
              Remembered it after all?{' '}
            </ThemedText>
            <Link href="/login">
              <ThemedText type="small" themeColor="tint">
                Back to login
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
