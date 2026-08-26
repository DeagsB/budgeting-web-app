// Thin re-export so the Maple auth pages can import from `./actions` as the
// fix-pack authors them. The real implementation lives at
// src/app/(auth)/actions.ts - shared between sign-in and sign-up.
export { signIn, signUp, signOut, type AuthState } from '../actions'
