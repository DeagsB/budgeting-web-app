// OFX 1.x / 2.x parser scoped to what bank exports actually contain:
// STMTTRN blocks with TRNTYPE, DTPOSTED, TRNAMT, FITID, NAME, MEMO.
//
// OFX 1.x is SGML (unclosed tags) and 2.x is XML. Rather than ship a full SGML
// parser, this module locates each <STMTTRN>...</STMTTRN> by string search and
// pulls field values via per-tag regex. That's enough for every Canadian
// big-six export I've inspected; if a bank ships something exotic, we'll add a
// targeted hook here.

export type OfxTransaction = {
  fitid: string                    // unique-per-account dedup id
  postedOn: string                 // YYYY-MM-DD
  amountCents: number              // sign convention: positive = outflow (matches our DB)
  description: string | null
  memo: string | null
  trnType: string | null           // DEBIT, CREDIT, etc. (raw)
}

export type OfxParseResult = {
  transactions: OfxTransaction[]
  accountId: string | null         // ACCTID inside <BANKACCTFROM> if present
  currency: string | null          // CURDEF if present
}

const TAG = (name: string) =>
  // Capture text after <NAME> up to the next tag or close tag. OFX 1.x often
  // omits closing tags so we stop at < or end-of-string.
  new RegExp(`<${name}>\\s*([^<\\r\\n]*)`, 'i')

const STMTTRN_BLOCK = /<STMTTRN\b[^>]*>([\s\S]*?)<\/STMTTRN\s*>/gi

function dtToISO(raw: string): string | null {
  // OFX dates: YYYYMMDD or YYYYMMDDHHMMSS[.fff][TZ]. We only need the date.
  const m = raw.trim().match(/^(\d{4})(\d{2})(\d{2})/)
  if (!m) return null
  return `${m[1]}-${m[2]}-${m[3]}`
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function pickField(block: string, tag: string): string | null {
  const m = block.match(TAG(tag))
  if (!m) return null
  const v = decodeEntities(m[1].trim())
  return v.length ? v : null
}

export function parseOFX(input: string): OfxParseResult {
  // Strip the OFX header (key:value lines up to a blank line) if present —
  // the body underneath is the SGML/XML payload we want.
  const headerEnd = input.search(/<OFX\b/i)
  const body = headerEnd >= 0 ? input.slice(headerEnd) : input

  const accountId = pickField(body, 'ACCTID')
  const currency = pickField(body, 'CURDEF')

  const transactions: OfxTransaction[] = []
  const blocks = body.matchAll(STMTTRN_BLOCK)
  for (const match of blocks) {
    const block = match[1]
    const fitid = pickField(block, 'FITID')
    const dtposted = pickField(block, 'DTPOSTED')
    const trnamt = pickField(block, 'TRNAMT')
    const name = pickField(block, 'NAME')
    const memo = pickField(block, 'MEMO')
    const trnType = pickField(block, 'TRNTYPE')
    const payee = pickField(block, 'PAYEE')

    if (!fitid || !dtposted || !trnamt) continue
    const isoDate = dtToISO(dtposted)
    if (!isoDate) continue
    const amountFloat = Number(trnamt.replace(/[^0-9.\-]/g, ''))
    if (!Number.isFinite(amountFloat)) continue

    // OFX convention: positive = money INTO account (deposit/credit), negative
    // = money OUT (debit/purchase). The app's internal convention is inverted
    // (positive = outflow), so flip the sign.
    const amountCents = Math.round(-amountFloat * 100)

    transactions.push({
      fitid,
      postedOn: isoDate,
      amountCents,
      description: name ?? payee ?? null,
      memo,
      trnType,
    })
  }

  return { transactions, accountId, currency }
}
