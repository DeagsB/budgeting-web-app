/**
 * Reading Supabase Auth's sign-up response with email-enumeration protection
 * on (the default). To avoid leaking who has an account, `signUp` on an
 * address that is already registered and confirmed returns a *fake* success:
 * a user object with an empty `identities` array, no session, and no email
 * sent. Left alone, that would drop the person on "check your inbox" waiting
 * for mail that never comes - so the sign-up action turns it into a clear
 * "you already have an account" message instead.
 *
 * An unconfirmed existing address behaves differently: Supabase re-sends the
 * confirmation and returns the real user (identities populated), so that
 * case still belongs on the check-email page.
 */
/** Where the emailed recovery link lands (via /auth/confirm) to choose a new password. */
export const RESET_PASSWORD_PATH = '/reset-password'

export function isExistingAccountSignUp(user: { identities?: unknown[] | null } | null | undefined): boolean {
  if (!user) return false
  return Array.isArray(user.identities) && user.identities.length === 0
}
