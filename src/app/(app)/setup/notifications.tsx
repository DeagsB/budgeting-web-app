'use client'

import { useActionState, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { MapleLabel } from '@/components/ui/label'
import { saveNotificationPrefs } from './notification-actions'
import { type SavePrefsState, type NotificationPrefs } from './notification-prefs'

const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) arr[i] = raw.charCodeAt(i)
  return arr
}

export function NotificationSettings({ prefs }: { prefs: NotificationPrefs }) {
  const [supported, setSupported] = useState(true)
  const [standalone, setStandalone] = useState(true)
  const [subscribed, setSubscribed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const sup = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
    const sa =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported(sup)
    setStandalone(sa)
    if (sup) {
      navigator.serviceWorker.ready
        .then((reg) => reg.pushManager.getSubscription())
        .then((s) => setSubscribed(!!s))
        .catch(() => {})
    }
  }, [])

  async function enable() {
    setError(null)
    setBusy(true)
    try {
      if (!VAPID) {
        setError('Push isn’t configured on the server yet (missing VAPID key).')
        return
      }
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') {
        setError('Notification permission was not granted.')
        return
      }
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID) as BufferSource,
      })
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(sub),
      })
      if (!res.ok) {
        setError('Could not save the subscription. Try again.')
        return
      }
      setSubscribed(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not enable notifications.')
    } finally {
      setBusy(false)
    }
  }

  async function disable() {
    setError(null)
    setBusy(true)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        })
        await sub.unsubscribe()
      }
      setSubscribed(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not turn off notifications.')
    } finally {
      setBusy(false)
    }
  }

  const [prefState, prefAction, prefPending] = useActionState<SavePrefsState, FormData>(
    saveNotificationPrefs,
    undefined,
  )

  return (
    <section className="rounded-lg border border-hair bg-paper p-5 md:p-6">
      <MapleLabel>Notifications</MapleLabel>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-2">
        Get a push on your phone the moment a transaction lands. Works on iPhone once Maple is
        added to your home screen and opened from the icon.
      </p>

      {!supported ? (
        <p className="mt-4 rounded-md bg-cream-2 px-3 py-2 text-[12.5px] text-ink-2">
          This browser doesn’t support push notifications.
        </p>
      ) : !standalone ? (
        <p className="mt-4 rounded-md bg-cream-2 px-3 py-2 text-[12.5px] text-ink-2">
          Add Maple to your home screen first (Share → <b>Add to Home Screen</b>), then open it from
          the icon to turn notifications on.
        </p>
      ) : (
        <div className="mt-4 flex items-center gap-3">
          {subscribed ? (
            <>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-leaf-soft px-2.5 py-1 text-[12px] font-semibold text-leaf">
                On for this device
              </span>
              <Button variant="secondary" size="sm" onClick={disable} disabled={busy}>
                {busy ? 'Turning off…' : 'Turn off'}
              </Button>
            </>
          ) : (
            <Button variant="primary" size="sm" onClick={enable} disabled={busy}>
              {busy ? 'Enabling…' : 'Enable notifications'}
            </Button>
          )}
        </div>
      )}

      {error && (
        <p className="mt-2 rounded-md bg-maple-soft px-3 py-1.5 text-[12.5px] font-medium text-maple">
          {error}
        </p>
      )}

      {/* What to be notified about — saved household-wide. */}
      <form action={prefAction} className="mt-5 flex flex-col gap-3 border-t border-hair pt-5">
        <div className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-3">
          Notify me about
        </div>
        <Toggle name="new_transaction" label="Every new transaction" defaultChecked={prefs.new_transaction} />
        <div className="flex flex-col gap-2">
          <Toggle
            name="large_transaction"
            label="Large transactions only"
            hint="If “every transaction” is off, only ones above this amount."
            defaultChecked={prefs.large_transaction}
          />
          <label className="ml-7 flex items-center gap-2 text-[12.5px] text-ink-2">
            Threshold $
            <input
              name="large_threshold"
              type="number"
              min={0}
              step={1}
              inputMode="decimal"
              defaultValue={(prefs.large_threshold_cents / 100).toString()}
              className="maple-input sm w-24"
            />
          </label>
        </div>
        <Toggle name="budget_overspend" label="A category goes over budget" defaultChecked={prefs.budget_overspend} />
        <Toggle
          name="unmatched_alert"
          label="A bank alert couldn’t be imported"
          hint="No rule matched — so you can add one."
          defaultChecked={prefs.unmatched_alert}
        />
        <Toggle
          name="settlement_period"
          label="Shared expenses closed — time to settle"
          hint="Each member gets their own “you owe” on the close day."
          defaultChecked={prefs.settlement_period}
        />

        <div className="mt-1 flex items-center gap-3" aria-live="polite">
          <Button type="submit" variant="secondary" size="sm" disabled={prefPending}>
            {prefPending ? 'Saving…' : 'Save preferences'}
          </Button>
          {prefState && 'ok' in prefState && (
            <span className="text-[12px] font-medium text-leaf">Saved.</span>
          )}
          {prefState && 'error' in prefState && (
            <span className="text-[12px] font-medium text-maple">{prefState.error}</span>
          )}
        </div>
      </form>
    </section>
  )
}

function Toggle({
  name,
  label,
  hint,
  defaultChecked,
}: {
  name: string
  label: string
  hint?: string
  defaultChecked: boolean
}) {
  return (
    <label className="flex items-start gap-3">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-leaf)]"
      />
      <span className="min-w-0">
        <span className="block text-[14px] text-ink">{label}</span>
        {hint && <span className="block text-[11.5px] text-ink-3">{hint}</span>}
      </span>
    </label>
  )
}
