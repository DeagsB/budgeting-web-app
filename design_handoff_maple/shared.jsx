// shared.jsx — common primitives + data for all three directions.
// Real household/investment data shape borrowed from the repo's domain model:
// - CAD money, bigint cents → formatMoney
// - Canadian registered accounts (TFSA/RRSP/FHSA) with CRA room
// - Members + shared expenses + settlements

const fmtCAD = (cents) => {
  const n = typeof cents === 'bigint' ? Number(cents) : cents;
  return new Intl.NumberFormat('en-CA', {
    style: 'currency', currency: 'CAD',
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(n / 100);
};
const fmtCADshort = (cents) => {
  const n = (typeof cents === 'bigint' ? Number(cents) : cents) / 100;
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n/1_000_000).toFixed(2)}M`;
  if (abs >= 10_000) return `$${(n/1000).toFixed(1)}K`;
  if (abs >= 1000) return `$${(n/1000).toFixed(2)}K`;
  return `$${n.toFixed(0)}`;
};
const fmtSign = (cents) => {
  const s = fmtCAD(Math.abs(cents));
  return cents >= 0 ? `+${s}` : `−${s}`;
};

// ───────── Household data ─────────
const DATA = {
  household: 'The Tremblay–Osei household',
  month: 'April 2026',
  members: [
    { id: 'a', name: 'Amélie', initial: 'A', color: '#3B82F6' },
    { id: 'j', name: 'Jordan', initial: 'J', color: '#8B5CF6' },
  ],
  accounts: [
    { id: 'chq', name: 'Joint Chequing', type: 'chequing', owner: 'shared', balance: 842350, bank: 'RBC' },
    { id: 'sav', name: 'High-Interest Savings', type: 'savings', owner: 'shared', balance: 1845000, bank: 'EQ Bank' },
    { id: 'tfsa_a', name: 'TFSA — Amélie', type: 'tfsa', owner: 'a', balance: 4612400, bank: 'Wealthsimple' },
    { id: 'rrsp_a', name: 'RRSP — Amélie', type: 'rrsp', owner: 'a', balance: 8934800, bank: 'Questrade' },
    { id: 'fhsa_j', name: 'FHSA — Jordan', type: 'fhsa', owner: 'j', balance: 1600000, bank: 'Wealthsimple' },
    { id: 'tfsa_j', name: 'TFSA — Jordan', type: 'tfsa', owner: 'j', balance: 3821500, bank: 'Questrade' },
    { id: 'cc', name: 'Cashback Visa', type: 'credit_card', owner: 'shared', balance: -194280, bank: 'Tangerine' },
  ],
  netWorth: 21471870, // cents
  netWorthLast: 20104200,
  income: 1284500,
  expenses: 621940,
  net: 662560,

  // 12-month net worth trail (cents). Upward drift with realistic noise.
  netWorthTrail: [
    15_240_000, 15_590_000, 15_820_000, 16_410_000, 16_230_000,
    16_980_000, 17_540_000, 18_120_000, 18_640_000, 19_380_000,
    20_104_200, 21_471_870,
  ],
  // Monthly spending, 12 months (cents)
  spendTrail: [
    584000, 612000, 598000, 645000, 571000,
    689000, 712000, 598000, 632000, 608000,
    574000, 621940,
  ],
  // Portfolio trail — invested accounts only
  portfolioTrail: [
    14_200_000, 14_480_000, 14_310_000, 14_920_000, 15_210_000,
    15_780_000, 16_210_000, 16_890_000, 17_340_000, 18_050_000,
    18_620_000, 18_968_700,
  ],

  budgets: [
    { cat: 'Housing', budget: 195000, actual: 195000, color: '#6366F1' },
    { cat: 'Groceries', budget: 80000, actual: 92400, color: '#10B981' },
    { cat: 'Transport', budget: 45000, actual: 38200, color: '#F59E0B' },
    { cat: 'Dining', budget: 30000, actual: 42180, color: '#EF4444' },
    { cat: 'Subscriptions', budget: 12000, actual: 11400, color: '#06B6D4' },
    { cat: 'Savings', budget: 120000, actual: 120000, color: '#8B5CF6' },
    { cat: 'Entertainment', budget: 20000, actual: 15600, color: '#EC4899' },
    { cat: 'Health', budget: 25000, actual: 12960, color: '#14B8A6' },
  ],

  transactions: [
    { id: 1, date: 'Apr 19', merchant: 'Loblaws', cat: 'Groceries', amount: -12840, account: 'Visa', member: 'shared', shared: true },
    { id: 2, date: 'Apr 18', merchant: 'Employer — Payroll', cat: 'Income', amount: 412500, account: 'Chequing', member: 'a', shared: false },
    { id: 3, date: 'Apr 17', merchant: 'Tim Hortons', cat: 'Dining', amount: -1240, account: 'Visa', member: 'j', shared: false },
    { id: 4, date: 'Apr 17', merchant: 'Presto Top-up', cat: 'Transport', amount: -4000, account: 'Visa', member: 'a', shared: false },
    { id: 5, date: 'Apr 16', merchant: 'Hydro One', cat: 'Housing', amount: -18430, account: 'Chequing', member: 'shared', shared: true },
    { id: 6, date: 'Apr 15', merchant: 'Netflix', cat: 'Subscriptions', amount: -1899, account: 'Visa', member: 'shared', shared: true },
    { id: 7, date: 'Apr 14', merchant: 'Shoppers Drug Mart', cat: 'Health', amount: -3240, account: 'Visa', member: 'a', shared: false },
    { id: 8, date: 'Apr 13', merchant: 'Wealthsimple — Buy VEQT', cat: 'Savings', amount: -50000, account: 'TFSA', member: 'a', shared: false },
    { id: 9, date: 'Apr 12', merchant: 'Blue Jays Tickets', cat: 'Entertainment', amount: -15600, account: 'Visa', member: 'shared', shared: true },
    { id: 10, date: 'Apr 11', merchant: 'Metro', cat: 'Groceries', amount: -8940, account: 'Visa', member: 'shared', shared: true },
    { id: 11, date: 'Apr 10', merchant: 'Employer — Payroll', cat: 'Income', amount: 384000, account: 'Chequing', member: 'j', shared: false },
    { id: 12, date: 'Apr 09', merchant: 'IKEA', cat: 'Housing', amount: -24890, account: 'Visa', member: 'shared', shared: true },
  ],

  contributions: [
    { member: 'Amélie', type: 'TFSA', room: 700000, contributed: 450000, color: '#10B981' },
    { member: 'Amélie', type: 'RRSP', room: 1842000, contributed: 1200000, color: '#6366F1' },
    { member: 'Amélie', type: 'FHSA', room: 800000, contributed: 0, color: '#F59E0B' },
    { member: 'Jordan', type: 'TFSA', room: 700000, contributed: 680000, color: '#10B981' },
    { member: 'Jordan', type: 'RRSP', room: 1420000, contributed: 920000, color: '#6366F1' },
    { member: 'Jordan', type: 'FHSA', room: 800000, contributed: 750000, color: '#F59E0B' },
  ],

  // Shared-expense state: net of all "shared" txns this month
  sharedNet: { owed: 'a', amount: 16450, partnerPaid: 32900, youPaid: 0 },
};

// ───────── Inline SVG icons (stroked, thin) ─────────
const Icon = {
  home: (c='currentColor') => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1v-9.5Z"/></svg>,
  list: (c='currentColor') => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h10"/></svg>,
  pie: (c='currentColor') => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v9l7.5 4.5A9 9 0 1 1 12 3Z"/></svg>,
  chart: (c='currentColor') => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 20h18M6 16l4-6 3 4 5-8"/></svg>,
  users: (c='currentColor') => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.8"/><path d="M14.5 20v-.5A5 5 0 0 1 22 20"/></svg>,
  settings: (c='currentColor') => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.1.6.52 1.1 1.08 1.3l.07.02A2 2 0 1 1 20 14h-.09a1.7 1.7 0 0 0-1.51 1.03Z"/></svg>,
  send: (c='currentColor') => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2 11 13M22 2 15 22l-4-9-9-4 20-7Z"/></svg>,
  card: (c='currentColor') => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2.5" y="5.5" width="19" height="13" rx="2.5"/><path d="M2.5 10h19"/></svg>,
  plus: (c='currentColor') => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>,
  search: (c='currentColor') => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>,
  eye: (c='currentColor') => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12Z"/><circle cx="12" cy="12" r="3.5"/></svg>,
  eyeOff: (c='currentColor') => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m2 2 20 20M6.7 6.7A10.5 10.5 0 0 0 1 12s4 8 11 8a10.5 10.5 0 0 0 5.3-1.3M9.9 4.2A11.3 11.3 0 0 1 12 4c7 0 11 8 11 8a17.8 17.8 0 0 1-2.6 3.6M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>,
  arrowUp: (c='currentColor') => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>,
  arrowDown: (c='currentColor') => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>,
  maple: (c='currentColor') => <svg width="18" height="18" viewBox="0 0 24 24" fill={c}><path d="M12 2l1.4 3.6 3.8-1L15.6 8l4.4 2-4 2.2 1 4.4-4-1-1 3.4-1-3.4-4 1 1-4.4-4-2.2 4.4-2L8.8 4.6l3.8 1L12 2Z"/></svg>,
  cad: (c='currentColor') => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M15 9.5A3.5 3.5 0 0 0 12 8c-2 0-3.5 1.8-3.5 4s1.5 4 3.5 4a3.5 3.5 0 0 0 3-1.5M8 14.5h4"/></svg>,
};

// ───────── Helper: bezier-smoothed area/line path ─────────
function smoothPath(points, { tension = 0.35 } = {}) {
  if (points.length < 2) return '';
  const cps = points.map((_, i, a) => {
    const prev = a[Math.max(0, i - 1)];
    const next = a[Math.min(a.length - 1, i + 1)];
    return [(next[0] - prev[0]) * tension, (next[1] - prev[1]) * tension];
  });
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    const [cp0x, cp0y] = cps[i - 1];
    const [cp1x, cp1y] = cps[i];
    d += ` C${x0 + cp0x},${y0 + cp0y} ${x1 - cp1x},${y1 - cp1y} ${x1},${y1}`;
  }
  return d;
}

function seriesToPoints(values, w, h, { pad = 4 } = {}) {
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const step = (w - pad * 2) / (values.length - 1);
  return values.map((v, i) => [pad + i * step, h - pad - ((v - min) / span) * (h - pad * 2)]);
}

// ───────── Scrollbar-hiding inner scroll view (common) ─────────
function ScrollArea({ children, style }) {
  return (
    <div style={{ overflow: 'auto', height: '100%', ...style }}
         className="hide-scroll">
      {children}
    </div>
  );
}

// Inject once
if (typeof document !== 'undefined' && !document.getElementById('shared-styles')) {
  const s = document.createElement('style');
  s.id = 'shared-styles';
  s.textContent = `
    .hide-scroll::-webkit-scrollbar{display:none}
    .hide-scroll{scrollbar-width:none;-ms-overflow-style:none}
    @keyframes sheen {
      0%{background-position:-200% 0}
      100%{background-position:200% 0}
    }
    @keyframes revealUp {
      from{opacity:0;transform:translateY(6px)}
      to{opacity:1;transform:none}
    }
  `;
  document.head.appendChild(s);
}

Object.assign(window, { DATA, Icon, fmtCAD, fmtCADshort, fmtSign, smoothPath, seriesToPoints, ScrollArea });
