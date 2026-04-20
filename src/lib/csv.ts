// Minimal RFC 4180-ish CSV parser. Handles quoted fields, doubled quotes,
// CRLF + LF line endings, and trimmed trailing newline. Returns a 2D array of
// strings — no header interpretation. Good enough for pasted bank / brokerage
// exports without pulling in a dep.

export function parseCSV(input: string): string[][] {
  const rows: string[][] = []
  let field = ''
  let row: string[] = []
  let inQuotes = false
  let i = 0

  while (i < input.length) {
    const ch = input[i]

    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i += 1
        continue
      }
      field += ch
      i += 1
      continue
    }

    if (ch === '"') {
      inQuotes = true
      i += 1
      continue
    }

    if (ch === ',') {
      row.push(field)
      field = ''
      i += 1
      continue
    }

    if (ch === '\r' || ch === '\n') {
      // Normalise CRLF → single newline
      if (ch === '\r' && input[i + 1] === '\n') i += 1
      row.push(field)
      field = ''
      rows.push(row)
      row = []
      i += 1
      continue
    }

    field += ch
    i += 1
  }

  // Trailing field/row if the file didn't end with a newline
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  // Drop completely empty trailing rows (e.g. from trailing newline).
  while (rows.length > 0 && rows[rows.length - 1].every((c) => c === '')) rows.pop()

  return rows
}
