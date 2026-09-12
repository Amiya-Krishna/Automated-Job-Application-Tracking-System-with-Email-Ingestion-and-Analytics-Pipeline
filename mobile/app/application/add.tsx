import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet } from 'react-native';

import { ApplicationFormFields } from '@/components/application-form-fields';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useCreateApplication } from '@/hooks/use-applications';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/types/api';
import {
  applicationFormDefaults,
  applicationFormSchema,
  toApplicationRequestBody,
  type ApplicationFormValues,
} from '@/utils/application-validation';

export default function AddApplicationScreen() {
  const theme = useTheme();
  const createApplication = useCreateApplication();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ApplicationFormValues>({
    resolver: zodResolver(applicationFormSchema),
    defaultValues: applicationFormDefaults,
  });

  const onSubmit = async (values: ApplicationFormValues) => {
    setFormError(null);
    try {
      const created = await createApplication.mutateAsync(toApplicationRequestBody(values));
      // .replace, not .push — the add form shouldn't sit in the back
      // stack, so the back button from the new detail screen returns to
      // the Applications list, not to a filled-in Add form.
      router.replace({ pathname: '/application/[id]', params: { id: String(created.id) } });
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
          Track a job you applied to manually — company and job title are the only required fields.
        </ThemedText>

        {formError ? (
          <ThemedView style={[styles.errorBanner, { borderColor: theme.danger }]}>
            <ThemedText type="small" themeColor="danger">
              {formError}
            </ThemedText>
          </ThemedView>
        ) : null}

        <ApplicationFormFields control={control} errors={errors} showDescription />

        <Pressable
          accessibilityRole="button"
          disabled={isSubmitting}
          onPress={handleSubmit(onSubmit)}
          style={[styles.submitButton, { backgroundColor: theme.tint, opacity: isSubmitting ? 0.7 : 1 }]}>
          <ThemedText type="smallBold" style={styles.submitButtonText}>
            {isSubmitting ? 'Adding…' : 'Add application'}
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
