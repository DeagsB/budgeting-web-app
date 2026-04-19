import Link from 'next/link'

export default function CheckEmailPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-6">
      <h1 className="text-2xl font-semibold">Check your email</h1>
      <p className="text-sm text-gray-600">
        We sent a confirmation link to your inbox. Click it to finish creating your account, then
        come back and sign in.
      </p>
      <Link href="/sign-in" className="text-sm font-medium text-gray-900 underline">
        Back to sign in
      </Link>
    </main>
  )
}
