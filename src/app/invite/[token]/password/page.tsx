import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SetPasswordForm } from './form'

export const dynamic = 'force-dynamic'

/** Invited logins arrive via magic link with no password; set one here. */
export default async function InvitePasswordPage() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) redirect('/sign-in')

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--color-cream)] px-6 py-10 text-[var(--color-ink)]">
      <div className="w-full max-w-[440px]">
        <div className="mb-6 text-center">
          <div className="font-serif text-[36px] leading-none tracking-[-0.02em]">Maple</div>
          <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-ink-3)]">
            One last step
          </div>
        </div>
        <div className="rounded-[24px] border border-[var(--color-hair)] bg-[var(--color-paper)] p-6 shadow-[var(--shadow-float)] md:p-7">
          <h1 className="font-serif text-[28px] leading-[1.05] tracking-[-0.02em]">Choose a password.</h1>
          <p className="mt-3 text-[14.5px] leading-relaxed text-[var(--color-ink-2)]">
            You are in. Set a password for <strong className="font-semibold text-[var(--color-ink)]">{data.user.email}</strong>{' '}
            so you can sign in next time without a link.
          </p>
          <div className="mt-5">
            <SetPasswordForm />
          </div>
        </div>
      </div>
    </main>
  )
}
