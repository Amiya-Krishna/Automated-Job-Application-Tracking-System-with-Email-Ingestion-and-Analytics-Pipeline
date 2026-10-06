/** The word the user must type to confirm permanent account deletion. */
export const DELETE_CONFIRM_WORD = 'DELETE';

/**
 * True only when the confirmation word was typed EXACTLY (case-sensitive, no surrounding spaces)
 * AND a non-empty password was entered. Used to enable the "Permanently delete" button.
 */
export function isDeleteConfirmed(typed: string, password: string): boolean {
  return typed === DELETE_CONFIRM_WORD && password.length > 0;
}
