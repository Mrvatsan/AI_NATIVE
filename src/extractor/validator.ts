import { z } from 'zod';
import { AppIntentSchema, AppIntent } from '../schemas/appIntent';

export interface ValidationResult {
  isValid: boolean;
  data?: AppIntent;
  errors?: z.ZodIssue[];
}

export const validateIntent = (data: unknown): ValidationResult => {
  // Validate against schema
  // We use safeParse to avoid throwing exceptions, satisfying the requirement:
  // "Validation must not throw exceptions."
  const result = AppIntentSchema.safeParse(data);

  if (result.success) {
    return {
      isValid: true,
      data: result.data
    };
  } else {
    // Return structured errors
    return {
      isValid: false,
      errors: result.error.issues
    };
  }
};
