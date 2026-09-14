import { Control, Controller, FieldErrors } from 'react-hook-form';
import { StyleSheet } from 'react-native';

import { FormTextInput } from '@/components/form-text-input';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { ProfileFormValues } from '@/utils/profile-validation';

interface ProfileFormFieldsProps {
  control: Control<ProfileFormValues>;
  errors: FieldErrors<ProfileFormValues>;
}

export function ProfileFormFields({ control, errors }: ProfileFormFieldsProps) {
  return (
    <ThemedView style={styles.form}>
      <Controller
        control={control}
        name="fullName"
        render={({ field: { onChange, onBlur, value } }) => (
          <FormTextInput
            label="Full name"
            placeholder="Your name"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.fullName?.message}
          />
        )}
      />

      <Controller
        control={control}
        name="email"
        render={({ field: { onChange, onBlur, value } }) => (
          <FormTextInput
            label="Email"
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.email?.message}
          />
        )}
      />

      <Controller
        control={control}
        name="experienceYears"
        render={({ field: { onChange, onBlur, value } }) => (
          <FormTextInput
            label="Experience (years)"
            placeholder="e.g. 1.5"
            keyboardType="decimal-pad"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.experienceYears?.message}
          />
        )}
      />

      <Controller
        control={control}
        name="skills"
        render={({ field: { onChange, onBlur, value } }) => (
          <FormTextInput
            label="Skills (comma separated)"
            placeholder="React, Node.js, SQL"
            autoCapitalize="none"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.skills?.message}
          />
        )}
      />

      <Controller
        control={control}
        name="resumeText"
        render={({ field: { onChange, onBlur, value } }) => (
          <FormTextInput
            label="Resume text"
            placeholder="Paste your resume text — used for matching."
            multiline
            numberOfLines={8}
            style={styles.multiline}
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.resumeText?.message}
          />
        )}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: Spacing.three,
    backgroundColor: 'transparent',
  },
  multiline: {
    minHeight: 160,
    textAlignVertical: 'top',
    paddingTop: Spacing.two,
  },
});
