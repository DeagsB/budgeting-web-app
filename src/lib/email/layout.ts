/**
 * Maple transactional email layout - the single source of the HTML that every
 * email shares (wordmark, card, button, fallback link, optional code, footer).
 *
 * Bulletproof-email rules: nested tables, inline styles, VML button for
 * Outlook, dark-mode overrides via classes. Mirrors the app's Maple palette.
 *
 * Pure and dependency-free (no `@/` imports) so scripts/build-email-templates.ts
 * can run it under plain Node to regenerate the Supabase dashboard templates.
 */

export type EmailContent = {
  /** Tab title / <title>. */
  subject: string
  /** Hidden inbox preview line. */
  preheader: string
  /** Small uppercase label above the headline, e.g. "Account setup". */
  eyebrow: string
  /** Serif headline. */
  title: string
  /** Paragraphs under the headline. Already-escaped HTML (use `esc`/`strong`). */
  intro: string[]
  button?: { label: string; url: string }
  /** Shown as a paste-able link under the button. Defaults to button.url. */
  fallbackUrl?: string
  /** Optional one-time code block (Supabase {{ .Token }}). */
  code?: { lead: string; value: string }
  /** Muted note under the card, e.g. "Didn't request this? Ignore it." */
  note: string
}

const C = {
  cream: '#f6f1e7',
  card: '#fffdf7',
  codebox: '#fbf5e9',
  hair: '#e7ddcd',
  ink: '#1e1a17',
  ink2: '#6b5f54',
  ink3: '#a89b8e',
  leaf: '#1f5641',
  paper: '#fffdf7',
} as const

const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
const SERIF = "Georgia, 'Times New Roman', serif"

/** HTML-escape untrusted text (names, emails) before interpolating. */
export function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Emphasised inline text in the Maple ink colour. Escapes its input. */
export function strong(s: string): string {
  return `<span class="dm-ink" style="color: ${C.ink}; font-weight: 600;">${esc(s)}</span>`
}

const hairline = `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="dm-hairline">
  <tr><td style="padding: 28px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="dm-hairline">
      <tr><td style="border-top: 1px solid ${C.hair}; font-size: 0; line-height: 0; height: 1px;">&nbsp;</td></tr>
    </table>
  </td></tr>
</table>`

function buttonBlock(b: { label: string; url: string }): string {
  const label = esc(b.label)
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr><td align="center" style="padding: 0 0 8px 0;">
    <!--[if mso]>
    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${b.url}" style="height:50px;v-text-anchor:middle;width:300px;" arcsize="22%" strokecolor="${C.leaf}" fillcolor="${C.leaf}">
      <w:anchorlock/>
      <center style="color:${C.paper};font-family:${SANS};font-size:16px;font-weight:bold;">${label}</center>
    </v:roundrect>
    <![endif]-->
    <!--[if !mso]><!-- -->
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" class="sm-btn" style="margin: 0 auto;">
      <tr><td class="dm-btn" align="center" bgcolor="${C.leaf}" style="background-color: ${C.leaf}; border-radius: 11px;">
        <a href="${b.url}" target="_blank" class="sm-btn-a dm-btn-a" style="display: inline-block; padding: 15px 40px; font-family: ${SANS}; font-size: 16px; line-height: 20px; font-weight: 600; color: ${C.paper}; text-decoration: none; background-color: ${C.leaf}; border-radius: 11px; mso-padding-alt: 0;">${label}</a>
      </td></tr>
    </table>
    <!--<![endif]-->
  </td></tr>
</table>`
}

function fallbackBlock(url: string): string {
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr><td align="center" style="padding: 20px 0 0 0;">
    <p class="dm-ink-3" style="margin: 0 0 6px 0; mso-line-height-rule: exactly; font-family: ${SANS}; font-size: 13px; line-height: 20px; color: ${C.ink3};">Or paste this link into your browser:</p>
    <a href="${url}" target="_blank" class="dm-fallback" style="font-family: ${SANS}; font-size: 13px; line-height: 20px; color: ${C.leaf}; word-break: break-all;">${url}</a>
  </td></tr>
</table>`
}

function codeBlock(code: { lead: string; value: string }): string {
  return `${hairline}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr><td align="center" style="padding: 0;">
    <p class="dm-ink-2" style="margin: 0 0 14px 0; mso-line-height-rule: exactly; font-family: ${SANS}; font-size: 14px; line-height: 21px; color: ${C.ink2};">${esc(code.lead)}</p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 0 auto;">
      <tr><td class="dm-codebox" align="center" bgcolor="${C.codebox}" style="background-color: ${C.codebox}; border: 1px solid ${C.hair}; border-radius: 10px; padding: 14px 26px;">
        <span class="dm-code" style="font-family: 'Courier New', Courier, monospace; font-size: 26px; line-height: 30px; letter-spacing: 6px; font-weight: bold; color: ${C.ink};">${code.value}</span>
      </td></tr>
    </table>
  </td></tr>
</table>`
}

/** Full HTML document for one email. */
export function renderEmailHtml(e: EmailContent): string {
  const fallback = e.fallbackUrl ?? e.button?.url
  const paragraphs = e.intro
    .map(
      (p) =>
        `<p class="dm-ink-2" style="margin: 0 0 12px 0; mso-line-height-rule: exactly; font-family: ${SANS}; font-size: 16px; line-height: 26px; color: ${C.ink2};">${p}</p>`,
    )
    .join('\n')

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="format-detection" content="telephone=no, date=no, address=no, email=no">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>${esc(e.subject)}</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch><o:AllowPNG/></o:OfficeDocumentSettings></xml></noscript><![endif]-->
  <style type="text/css">
    html, body { margin: 0 !important; padding: 0 !important; height: 100% !important; width: 100% !important; }
    * { -ms-text-size-adjust: 100%; -webkit-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt !important; mso-table-rspace: 0pt !important; border-collapse: collapse !important; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    a { text-decoration: none; }
    a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; font-size: inherit !important; font-family: inherit !important; font-weight: inherit !important; line-height: inherit !important; }
    .ExternalClass { width: 100%; }
    .ExternalClass, .ExternalClass p, .ExternalClass span, .ExternalClass font, .ExternalClass td, .ExternalClass div { line-height: 100%; }
    u + #body a { color: inherit; text-decoration: none; }
    #MessageViewBody a { color: inherit; text-decoration: none; }
    @media only screen and (max-width: 600px) {
      .sm-w-full { width: 100% !important; }
      .sm-px { padding-left: 24px !important; padding-right: 24px !important; }
      .sm-py { padding-top: 32px !important; padding-bottom: 32px !important; }
      .sm-btn { width: 100% !important; }
      .sm-btn-a { display: block !important; }
      .sm-wordmark { font-size: 30px !important; }
      .sm-h1 { font-size: 24px !important; line-height: 30px !important; }
    }
    @media (prefers-color-scheme: dark) {
      body, .dm-page { background-color: #181410 !important; }
      .dm-card { background-color: #221d18 !important; border-color: #2b2520 !important; }
      .dm-ink { color: #f4efe5 !important; }
      .dm-ink-2 { color: #b8aa99 !important; }
      .dm-ink-3 { color: #b8aa99 !important; }
      .dm-leaf { color: #7fc9a7 !important; }
      .dm-hairline td { border-top-color: #2b2520 !important; }
      .dm-codebox { background-color: #2b2520 !important; border-color: #3a332c !important; }
      .dm-code { color: #f4efe5 !important; }
      .dm-btn { background-color: #1f5641 !important; }
      .dm-btn-a { background-color: #1f5641 !important; color: #fffdf7 !important; }
      .dm-fallback { color: #7fc9a7 !important; }
    }
    [data-ogsc] body, [data-ogsb] .dm-page { background-color: #181410 !important; }
    [data-ogsb] .dm-card { background-color: #221d18 !important; }
    [data-ogsc] .dm-card { border-color: #2b2520 !important; }
    [data-ogsc] .dm-ink { color: #f4efe5 !important; }
    [data-ogsc] .dm-ink-2 { color: #b8aa99 !important; }
    [data-ogsc] .dm-ink-3 { color: #b8aa99 !important; }
    [data-ogsc] .dm-leaf { color: #7fc9a7 !important; }
    [data-ogsc] .dm-hairline td { border-top-color: #2b2520 !important; }
    [data-ogsb] .dm-codebox { background-color: #2b2520 !important; }
    [data-ogsc] .dm-codebox { border-color: #3a332c !important; }
    [data-ogsc] .dm-code { color: #f4efe5 !important; }
    [data-ogsc] .dm-fallback { color: #7fc9a7 !important; }
  </style>
</head>
<body id="body" class="dm-page" style="margin: 0; padding: 0; width: 100%; background-color: ${C.cream}; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; font-family: ${SANS};">
  <div style="display: none; max-height: 0; max-width: 0; overflow: hidden; mso-hide: all; font-size: 1px; line-height: 1px; color: ${C.cream}; opacity: 0;">${esc(e.preheader)}&#8203;&zwnj;&nbsp;&#8203;&zwnj;&nbsp;&#8203;&zwnj;&nbsp;&#8203;&zwnj;&nbsp;&#8203;&zwnj;&nbsp;&#8203;&zwnj;&nbsp;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="dm-page" style="background-color: ${C.cream};">
    <tr><td align="center" style="padding: 32px 16px;">
      <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td><![endif]-->
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="sm-w-full" style="width: 600px; max-width: 600px; margin: 0 auto;">
        <tr><td align="center" style="padding: 8px 0 28px 0;">
          <span class="sm-wordmark dm-ink" style="font-family: ${SERIF}; font-size: 34px; line-height: 36px; letter-spacing: 0.5px; color: ${C.ink};">Maple</span><span class="dm-leaf" style="font-family: ${SERIF}; font-size: 18px; line-height: 36px; color: ${C.leaf};" role="img" aria-label="maple leaf">&nbsp;&#9650;</span>
        </td></tr>
        <tr><td style="padding: 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="dm-card" style="background-color: ${C.card}; border: 1px solid ${C.hair}; border-radius: 16px;">
            <tr><td class="sm-px sm-py" style="padding: 44px 48px 40px 48px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="padding: 0 0 18px 0;">
                  <span class="dm-leaf" style="font-family: ${SANS}; font-size: 12px; line-height: 12px; color: ${C.leaf};" aria-hidden="true">&#9650;&nbsp;&nbsp;</span><span class="dm-ink-2" style="font-family: ${SANS}; font-size: 12px; line-height: 12px; letter-spacing: 2.5px; text-transform: uppercase; color: ${C.ink2};">${esc(e.eyebrow)}</span>
                </td></tr>
              </table>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="padding: 0 0 16px 0;">
                  <h1 class="sm-h1 dm-ink" style="margin: 0; mso-line-height-rule: exactly; font-family: ${SERIF}; font-size: 28px; line-height: 34px; font-weight: normal; color: ${C.ink};">${esc(e.title)}</h1>
                </td></tr>
              </table>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="padding: 0;">${paragraphs}</td></tr>
              </table>
              ${e.button ? hairline + buttonBlock(e.button) : ''}
              ${fallback ? fallbackBlock(fallback) : ''}
              ${e.code ? codeBlock(e.code) : ''}
            </td></tr>
          </table>
        </td></tr>
        <tr><td class="sm-px" style="padding: 28px 32px 8px 32px;">
          <p class="dm-ink-3" style="margin: 0 0 16px 0; mso-line-height-rule: exactly; font-family: ${SANS}; font-size: 13px; line-height: 21px; color: ${C.ink3}; text-align: center;">${esc(e.note)}</p>
        </td></tr>
        <tr><td align="center" style="padding: 8px 0 0 0;">
          <span class="dm-ink-2" style="font-family: ${SERIF}; font-size: 16px; line-height: 18px; color: ${C.ink2};">Maple</span><span class="dm-leaf" style="font-family: ${SERIF}; font-size: 11px; line-height: 18px; color: ${C.leaf};" role="img" aria-label="maple leaf">&nbsp;&#9650;</span>
          <p class="dm-ink-3" style="margin: 8px 0 0 0; mso-line-height-rule: exactly; font-family: ${SANS}; font-size: 12px; line-height: 18px; color: ${C.ink3};">Calm budgeting for Canadian households.</p>
        </td></tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td></tr>
  </table>
</body>
</html>
`
}

/** Strip tags/entities from the intro HTML for the text part. */
function toText(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&rsquo;/g, '’')
    .replace(/&mdash;/g, '-')
    .replace(/&nbsp;/g, ' ')
}

/** Plain-text alternative for the same content. */
export function renderEmailText(e: EmailContent): string {
  const lines: string[] = ['Maple', '', e.title.toUpperCase(), '']
  for (const p of e.intro) lines.push(toText(p), '')
  if (e.button) lines.push(`${e.button.label}: ${e.button.url}`, '')
  else if (e.fallbackUrl) lines.push(e.fallbackUrl, '')
  if (e.code) lines.push(e.code.lead, e.code.value, '')
  lines.push(e.note, '', '- Maple. Calm budgeting for Canadian households.')
  return lines.join('\n')
}

export function renderEmail(e: EmailContent): { subject: string; html: string; text: string } {
  return { subject: e.subject, html: renderEmailHtml(e), text: renderEmailText(e) }
}
