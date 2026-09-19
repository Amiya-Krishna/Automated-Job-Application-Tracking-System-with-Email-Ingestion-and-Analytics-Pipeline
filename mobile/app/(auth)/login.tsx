import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useLocalSearchParams } from 'expo-router';
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
import { loginSchema, type LoginFormValues } from '@/utils/auth-validation';

export default function LoginScreen() {
  const { login } = useAuth();
  const theme = useTheme();
  const { registeredEmail } = useLocalSearchParams<{ registeredEmail?: string }>();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: registeredEmail ?? '', password: '' },
  });

  const onSubmit = async (values: LoginFormValues) => {
    setFormError(null);
    try {
      await login(values);
      // No explicit navigation call: the root layout's Stack.Protected
      // guards (app/_layout.tsx) switch from the (auth) group to (drawer)
      // automatically once auth status flips to 'authenticated'.
    } catch (err) {
      // Covers invalid credentials ("User not found" / "Invalid
      // Password", both 400 from the backend), network failures, and
      // 5xx — ApiError.message is already a user-facing string (see
      // services/api.ts), never a raw Axios error.
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
            Welcome back
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Sign in to keep tracking your applications.
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

          <Pressable
            accessibilityRole="button"
            disabled={isSubmitting}
            onPress={handleSubmit(onSubmit)}
            style={[styles.submitButton, { backgroundColor: theme.tint, opacity: isSubmitting ? 0.7 : 1 }]}>
            <ThemedText type="smallBold" style={styles.submitButtonText}>
              {isSubmitting ? 'Signing in…' : 'Sign in'}
            </ThemedText>
          </Pressable>

          <Link href="/forgot-password" style={styles.forgotPasswordLink}>
            <ThemedText type="small" themeColor="tint">
              Forgot password?
            </ThemedText>
          </Link>
        </ThemedView>

        <ThemedView style={styles.footer}>
          <ThemedText type="small" themeColor="textSecondary">
            Don&apos;t have an account?{' '}
          </ThemedText>
          <Link href="/register">
            <ThemedText type="small" themeColor="tint">
              Create one
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
  forgotPasswordLink: {
    alignSelf: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
});
