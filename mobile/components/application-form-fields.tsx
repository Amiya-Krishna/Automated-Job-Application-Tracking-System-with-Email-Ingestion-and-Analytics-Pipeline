import { Control, Controller, FieldErrors } from 'react-hook-form';
import { Pressable, StyleSheet } from 'react-native';

import { FormTextInput } from '@/components/form-text-input';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { TRACKED_JOB_STATUSES } from '@/types/applications';
import type { ApplicationFormValues } from '@/utils/application-validation';

interface ApplicationFormFieldsProps {
  control: Control<ApplicationFormValues>;
  errors: FieldErrors<ApplicationFormValues>;
  /**
   * The description field is only meaningful on Add: GET /api/jobs/applied
   * never returns a tracked job's `description` (see
   * server/services/appliedJobsService.js), so the Edit screen has no
   * current value to show and would otherwise render a field that always
   * looks blank regardless of what's actually stored.
   */
  showDescription?: boolean;
}

export function ApplicationFormFields({ control, errors, showDescription = false }: ApplicationFormFieldsProps) {
  const theme = useTheme();

  return (
    <ThemedView style={styles.form}>
      <Controller
        control={control}
        name="company"
        render={({ field: { onChange, onBlur, value } }) => (
          <FormTextInput
            label="Company"
            placeholder="e.g. Acme Corp"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.company?.message}
          />
        )}
      />

      <Controller
        control={control}
        name="role"
        render={({ field: { onChange, onBlur, value } }) => (
          <FormTextInput
            label="Job title"
            placeholder="e.g. Senior Backend Engineer"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.role?.message}
          />
        )}
      />

      <Controller
        control={control}
        name="status"
        render={({ field: { onChange, value } }) => (
          <ThemedView style={styles.statusField}>
            <ThemedText type="smallBold">Status</ThemedText>
            <ThemedView style={styles.statusRow}>
              {TRACKED_JOB_STATUSES.map((option) => {
                const selected = value === option;
                return (
                  <Pressable
                    key={option}
                    accessibilityRole="button"
                    onPress={() => onChange(option)}
                    style={[
                      styles.statusOption,
                      {
                        borderColor: selected ? theme.tint : theme.border,
                        backgroundColor: selected ? theme.tint : 'transparent',
                      },
                    ]}>
                    <ThemedText type="small" style={selected ? styles.statusTextSelected : undefined}>
                      {option}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </ThemedView>
          </ThemedView>
        )}
      />

      <Controller
        control={control}
        name="location"
        render={({ field: { onChange, onBlur, value } }) => (
          <FormTextInput
            label="Location"
            placeholder="e.g. Remote, or San Francisco, CA"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.location?.message}
          />
        )}
      />

      <Controller
        control={control}
        name="applicationDate"
        render={({ field: { onChange, onBlur, value } }) => (
          <FormTextInput
            label="Applied date (optional)"
            placeholder="YYYY-MM-DD"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.applicationDate?.message}
          />
        )}
      />

      <Controller
        control={control}
        name="interviewDate"
        render={({ field: { onChange, onBlur, value } }) => (
          <FormTextInput
            label="Interview date (optional)"
            placeholder="YYYY-MM-DD"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.interviewDate?.message}
          />
        )}
      />

      <Controller
        control={control}
        name="sourceUrl"
        render={({ field: { onChange, onBlur, value } }) => (
          <FormTextInput
            label="Job posting URL (optional)"
            placeholder="https://…"
            keyboardType="url"
            autoCapitalize="none"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.sourceUrl?.message}
          />
        )}
      />

      <Controller
        control={control}
        name="notes"
        render={({ field: { onChange, onBlur, value } }) => (
          <FormTextInput
            label="Notes (optional)"
            placeholder="Anything worth remembering about this one"
            multiline
            numberOfLines={3}
            style={styles.multiline}
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.notes?.message}
          />
        )}
      />

      {showDescription ? (
        <Controller
          control={control}
          name="description"
          render={({ field: { onChange, onBlur, value } }) => (
            <FormTextInput
              label="Job description (optional)"
              placeholder="Paste the posting text, if you have it"
              multiline
              numberOfLines={5}
              style={styles.multiline}
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.description?.message}
            />
          )}
        />
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: Spacing.three,
    backgroundColor: 'transparent',
  },
  statusField: {
    gap: Spacing.two,
    backgroundColor: 'transparent',
  },
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    backgroundColor: 'transparent',
  },
  statusOption: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    minHeight: 44,
    justifyContent: 'center',
  },
  statusTextSelected: {
    color: '#ffffff',
  },
  multiline: {
    minHeight: 80,
    textAlignVertical: 'top',
    paddingTop: Spacing.two,
  },
});
