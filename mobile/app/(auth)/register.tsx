import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FormTextInput } from '@/components/form-text-input';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/types/api';
import { registerSchema, type RegisterFormValues } from '@/utils/auth-validation';

export default function RegisterScreen() {
  const { register: registerAccount } = useAuth();
  const theme = useTheme();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', email: '', password: '', confirmPassword: '' },
  });

  const onSubmit = async (values: RegisterFormValues) => {
    setFormError(null);
    try {
      await registerAccount({
        name: values.name.trim(),
        email: values.email.trim(),
        password: values.password,
      });
      // The backend does not log the user in on registration (no token
      // in the response — see services/auth.ts). Matches the web
      // client's own flow (client/src/pages/Register.jsx): go to login
      // with the email pre-filled so the only thing left to type is the
      // password they just chose.
      router.replace({ pathname: '/login', params: { registeredEmail: values.email.trim() } });
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
              Create your account
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Start tracking applications, interviews, and offers in one place.
            </ThemedText>
          </ThemedView>

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
              name="name"
              render={({ field: { onChange, onBlur, value } }) => (
                <FormTextInput
                  label="Full name"
                  placeholder="Your full name"
                  textContentType="name"
                  autoComplete="name"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors.name?.message}
                />
              )}
            />

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
                  placeholder="Create a password"
                  secureTextEntry
                  textContentType="newPassword"
                  autoComplete="new-password"
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
                  label="Confirm password"
                  placeholder="Re-enter your password"
                  secureTextEntry
                  textContentType="newPassword"
                  autoComplete="new-password"
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
                {isSubmitting ? 'Creating account…' : 'Create account'}
              </ThemedText>
            </Pressable>
          </ThemedView>

          <ThemedView style={styles.footer}>
            <ThemedText type="small" themeColor="textSecondary">
              Already have an account?{' '}
            </ThemedText>
            <Pressable accessibilityRole="link" onPress={() => router.replace('/login')}>
              <ThemedText type="small" themeColor="tint">
                Sign in
              </ThemedText>
            </Pressable>
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
