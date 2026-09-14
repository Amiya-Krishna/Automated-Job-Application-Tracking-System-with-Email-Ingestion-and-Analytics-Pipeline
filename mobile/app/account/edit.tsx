import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet } from 'react-native';

import { ErrorState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';
import { ProfileFormFields } from '@/components/profile-form-fields';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useProfile, useUpdateProfile } from '@/hooks/use-profile';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/types/api';
import {
  profileFormDefaults,
  profileFormSchema,
  toProfileRequestBody,
  type ProfileFormValues,
} from '@/utils/profile-validation';

export default function EditProfileScreen() {
  const theme = useTheme();
  const profile = useProfile();
  const updateProfile = useUpdateProfile();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: profileFormDefaults,
  });

  // Same reset-on-load pattern as app/application/[id]/edit.tsx: the
  // form can't be initialized with `profile.data` directly since the
  // query may still be in flight on first render.
  useEffect(() => {
    if (!profile.data) return;
    reset({
      fullName: profile.data.full_name ?? '',
      email: profile.data.email ?? '',
      // experience_years is a Prisma Decimal, serialized as a numeric
      // string already (see types/profile.ts) — safe to drop straight
      // into the text field as-is.
      experienceYears: profile.data.experience_years ?? '',
      skills: profile.data.skills.join(', '),
      resumeText: profile.data.resume_text ?? '',
    });
  }, [profile.data, reset]);

  if (profile.isLoading) {
    return <LoadingState label="Loading your profile…" />;
  }
  if (profile.isError) {
    return <ErrorState error={profile.error} onRetry={profile.refetch} />;
  }

  const onSubmit = async (values: ProfileFormValues) => {
    setFormError(null);
    try {
      await updateProfile.mutateAsync(toProfileRequestBody(values));
      router.back();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <ThemedText type="small" themeColor="textSecondary">
          This is the info used for job matching — the same profile the web app and browser
          extension read and update.
        </ThemedText>

        {formError ? (
          <ThemedView style={[styles.errorBanner, { borderColor: theme.danger }]}>
            <ThemedText type="small" themeColor="danger">
              {formError}
            </ThemedText>
          </ThemedView>
        ) : null}

        <ProfileFormFields control={control} errors={errors} />

        <Pressable
          accessibilityRole="button"
          disabled={isSubmitting}
          onPress={handleSubmit(onSubmit)}
          style={[styles.submitButton, { backgroundColor: theme.tint, opacity: isSubmitting ? 0.7 : 1 }]}>
          <ThemedText type="smallBold" style={styles.submitButtonText}>
            {isSubmitting ? 'Saving…' : 'Save profile'}
          </ThemedText>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    padding: Spacing.four,
    gap: Spacing.four,
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
});
