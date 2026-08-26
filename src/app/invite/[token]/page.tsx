import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { AcceptForm } from './accept-form'

export const dynamic = 'force-dynamic'

type Preview = { household_name: string; member_name: string; email_hint: string; status: string }

/**
 * Landing page for an invitation link. Works signed-out (preview only) and
 * signed-in (explicit Accept). Never mutates on GET.
 */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = await createClient()
  const [{ data: rows }, { data: userData }] = await Promise.all([
    supabase.rpc('preview_household_invitation', { raw_token: token }),
    supabase.auth.getUser(),
  ])
  const preview = ((rows as Preview[] | null) ?? [])[0] ?? null
  const user = userData?.user ?? null
  const nextParam = `?next=${encodeURIComponent(`/invite/${token}`)}`

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[var(--color-cream)] px-6 pb-10 pt-[calc(env(safe-area-inset-top)+40px)] text-[var(--color-ink)]">
      <div className="w-full max-w-[440px]">
        <div className="mb-6 text-center">
          <div className="font-serif text-[36px] leading-none tracking-[-0.02em]">Maple</div>
          <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-ink-3)]">
            Household invitation
          </div>
        </div>

        <div className="rounded-[24px] border border-[var(--color-hair)] bg-[var(--color-paper)] p-6 shadow-[var(--shadow-float)] md:p-7">
          {!preview ? (
            <Status
              title="This link is not valid."
              body="Invitation links are single-use and case-sensitive. Ask the household owner to send a new one."
            />
          ) : preview.status === 'accepted' ? (
            <Status title="Already used." body="This invitation has been accepted. Sign in to get to your household.">
              <Link href="/sign-in" className={btn('secondary')}>
                Sign in
              </Link>
            </Status>
          ) : preview.status === 'revoked' ? (
            <Status title="Invitation withdrawn." body="The household owner cancelled this invitation. Ask them for a new one." />
          ) : preview.status === 'expired' ? (
            <Status title="Invitation expired." body="Links are valid for 7 days. Ask the household owner to resend it." />
          ) : (
            <>
              <h1 className="font-serif text-[30px] leading-[1.05] tracking-[-0.02em]">
                Join <span className="whitespace-nowrap">{preview.household_name}</span>
              </h1>
              <p className="mt-3 text-[14.5px] leading-relaxed text-[var(--color-ink-2)]">
                You have been invited to track your money as{' '}
                <strong className="font-semibold text-[var(--color-ink)]">{preview.member_name}</strong>. Your own
                accounts stay private; only what you mark as shared is visible to the household.
              </p>
              <p className="mt-2 text-[12.5px] text-[var(--color-ink-3)]">Sent to {preview.email_hint}</p>

              {user ? (
                <div className="mt-6">
                  <p className="mb-3 text-[13px] text-[var(--color-ink-2)]">
                    Signed in as <span className="font-semibold text-[var(--color-ink)]">{user.email}</span>
                  </p>
                  <AcceptForm token={token} />
                </div>
              ) : (
                <div className="mt-6 flex flex-col gap-3">
                  <Link href={`/sign-up${nextParam}`} className={btn('primary')}>
                    Create an account
                  </Link>
                  <Link href={`/sign-in${nextParam}`} className={btn('secondary')}>
                    I already have one
                  </Link>
                  <p className="text-center text-[12px] text-[var(--color-ink-3)]">
                    Use the email address the invitation was sent to.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  )
}

function Status({ title, body, children }: { title: string; body: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <h1 className="font-serif text-[28px] leading-[1.05] tracking-[-0.02em]">{title}</h1>
      <p className="text-[14.5px] leading-relaxed text-[var(--color-ink-2)]">{body}</p>
      {children ? <div className="mt-2">{children}</div> : null}
    </div>
  )
}

function btn(variant: 'primary' | 'secondary') {
  const base =
    'inline-flex h-[50px] w-full items-center justify-center rounded-full text-[15px] font-semibold transition-transform active:scale-[0.98]'
  return variant === 'primary'
    ? `${base} bg-[var(--color-ink)] text-[var(--color-paper)]`
    : `${base} bg-[var(--color-paper)] text-[var(--color-ink)] ring-1 ring-inset ring-[var(--color-hair)]`
}
