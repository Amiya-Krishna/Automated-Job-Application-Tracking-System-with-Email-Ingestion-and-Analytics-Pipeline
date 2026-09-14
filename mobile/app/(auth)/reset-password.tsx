import { zodResolver } from '@hookform/resolvers/zod';
import { Link, router } from 'expo-router';
import { useState } from 'react';
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
 * Token entry is manual (paste from the email), not a deep link, and
 * that's a real, currently-unclosed gap rather than an oversight:
 *
 * The email's reset link points at `${CLIENT_URL}/reset-password?token=`
 * — the WEB client's own domain (server/routes/authRoutes.js's
 * forgot-password handler), decided once per server, not per request.
 * Unlike Gmail OAuth (Phase 3), there is no `source`/`redirectUri`
 * parameter here for the mobile app to ask for a different link shape —
 * the only input to /forgot-password is an email address, so the server
 * has no way to know whether the person who requested the reset wants a
 * web or mobile link.
 *
 * Making the link open this app directly would need one of:
 *   (a) Universal Links / App Links — hosting an
 *       apple-app-site-association / assetlinks.json file on the
 *       server's domain, plus native entitlements (associated domains /
 *       intent-filter) in the mobile build — a real backend + native
 *       config change, not a code-only mobile PR, and not something
 *       verifiable from this sandbox (no way to confirm DNS/hosting or
 *       run the native build), or
 *   (b) splitting CLIENT_URL by request source the way Gmail's
 *       redirectUri is, which would change what EVERY platform's reset
 *       email links to, including already-deployed web users.
 *
 * Per this phase's own instruction ("if implementing reset requires a
 * backend redirect/deep-link change, stop and explain the minimal
 * required change before modifying backend code"), neither was done
 * without checking in first — see the final report. What ships here
 * works completely today with zero backend changes: the same
 * POST /api/auth/reset-password {token, password} the web app calls,
 * just with the token pasted in instead of read from a URL.
 */
export default function ResetPasswordScreen() {
  const theme = useTheme();
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token: '', password: '', confirmPassword: '' },
  });

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
              Paste the reset code from the email we sent you, then choose a new password.
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
