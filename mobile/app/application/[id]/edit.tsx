import { zodResolver } from '@hookform/resolvers/zod';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet } from 'react-native';

import { ApplicationFormFields } from '@/components/application-form-fields';
import { ErrorState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useApplication, useUpdateApplication } from '@/hooks/use-applications';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/types/api';
import { TRACKED_JOB_STATUSES, type TrackedJobStatus } from '@/types/applications';
import {
  applicationFormDefaults,
  applicationFormSchema,
  toApplicationRequestBody,
  type ApplicationFormValues,
} from '@/utils/application-validation';

function isTrackedJobStatus(value: string): value is TrackedJobStatus {
  return (TRACKED_JOB_STATUSES as readonly string[]).includes(value);
}

export default function EditApplicationScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const trackedJobId = Number(id);

  const { application, isLoading, isError, error, refetch } = useApplication(trackedJobId);
  const updateApplication = useUpdateApplication();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ApplicationFormValues>({
    resolver: zodResolver(applicationFormSchema),
    defaultValues: applicationFormDefaults,
  });

  // The form can't be initialized with `application` directly (it may
  // still be `undefined` on first render, before the shared applications
  // list has loaded) — reset() once it becomes available instead.
  useEffect(() => {
    if (!application) return;
    reset({
      company: application.company,
      role: application.title,
      status: isTrackedJobStatus(application.status) ? application.status : 'Applied',
      location: application.location ?? '',
      notes: application.notes ?? '',
      sourceUrl: application.sourceUrl ?? '',
      // appliedDate is a DATE column that may serialize as a full
      // timestamp string — trim to yyyy-mm-dd for the text field.
      applicationDate: application.appliedDate ? application.appliedDate.slice(0, 10) : '',
      interviewDate: application.interviewDate ? application.interviewDate.slice(0, 10) : '',
      description: '',
    });
  }, [application, reset]);

  if (isLoading || application === undefined) {
    return <LoadingState label="Loading application…" />;
  }
  if (isError) {
    return <ErrorState error={error} onRetry={refetch} />;
  }
  if (application === null) {
    return (
      <ThemedView style={styles.notFoundContainer}>
        <ThemedText type="smallBold">Application not found</ThemedText>
      </ThemedView>
    );
  }

  const onSubmit = async (values: ApplicationFormValues) => {
    setFormError(null);
    try {
      await updateApplication.mutateAsync({
        trackedJobId,
        // description is intentionally excluded here — see
        // components/application-form-fields.tsx's showDescription
        // comment for why the Edit form never collects it.
        input: toApplicationRequestBody({ ...values, description: '' }),
      });
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
        {formError ? (
          <ThemedView style={[styles.errorBanner, { borderColor: theme.danger }]}>
            <ThemedText type="small" themeColor="danger">
              {formError}
            </ThemedText>
          </ThemedView>
        ) : null}

        <ApplicationFormFields control={control} errors={errors} />

        <Pressable
          accessibilityRole="button"
          disabled={isSubmitting}
          onPress={handleSubmit(onSubmit)}
          style={[styles.submitButton, { backgroundColor: theme.tint, opacity: isSubmitting ? 0.7 : 1 }]}>
          <ThemedText type="smallBold" style={styles.submitButtonText}>
            {isSubmitting ? 'Saving…' : 'Save changes'}
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
  notFoundContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
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
