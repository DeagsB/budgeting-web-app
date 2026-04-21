// maple-tokens.jsx — palette + shared interaction hooks for Maple direction.

const MAPLE_LIGHT = {
  mode: 'light',
  bg: '#F6F1E7',
  bgDeep: '#EFE7D7',
  surface: '#FFFDF7',
  surface2: '#FBF5E9',
  ink: '#1E1A17',
  ink2: '#6B5F54',
  ink3: '#A89B8E',
  hair: 'rgba(94,76,58,0.12)',
  hair2: 'rgba(94,76,58,0.06)',
  accent: '#1F5641',
  accentDeep: '#154031',
  accentSoft: '#D7E4DC',
  accentTint: '#E7F0EA',
  leaf: '#C83A1F',
  leafSoft: '#F6E0DB',
  butter: '#E7DCCF',
  honey: '#D4A574',
  up: '#2E7D32',
  down: '#C83A1F',
  shadow: '0 4px 14px rgba(31,86,65,0.12)',
  shadowHi: '0 10px 30px rgba(30,26,23,0.22)',
  font: '-apple-system, "Inter Tight", BlinkMacSystemFont, system-ui',
  serif: '"Instrument Serif", "Times New Roman", Georgia, serif',
};

const MAPLE_DARK = {
  mode: 'dark',
  bg: '#181410',
  bgDeep: '#0F0C09',
  surface: '#221D18',
  surface2: '#2B2520',
  ink: '#F4EFE5',
  ink2: '#B8AA99',
  ink3: '#7A6E61',
  hair: 'rgba(244,239,229,0.10)',
  hair2: 'rgba(244,239,229,0.05)',
  accent: '#7FC9A7',
  accentDeep: '#9AD8B4',
  accentSoft: 'rgba(127,201,167,0.16)',
  accentTint: 'rgba(127,201,167,0.08)',
  leaf: '#E86A50',
  leafSoft: 'rgba(232,106,80,0.14)',
  butter: '#3B332A',
  honey: '#D4A574',
  up: '#7FC9A7',
  down: '#E86A50',
  shadow: '0 4px 14px rgba(0,0,0,0.35)',
  shadowHi: '0 10px 30px rgba(0,0,0,0.5)',
  font: '-apple-system, "Inter Tight", BlinkMacSystemFont, system-ui',
  serif: '"Instrument Serif", "Times New Roman", Georgia, serif',
};

function useMaple() { return React.useContext(MapleCtx); }
const MapleCtx = React.createContext(MAPLE_LIGHT);

function MapleTheme({ dark, children }) {
  return <MapleCtx.Provider value={dark ? MAPLE_DARK : MAPLE_LIGHT}>{children}</MapleCtx.Provider>;
}

// Category chrome that adapts to palette
function mCatTint(cat, M) {
  const map = {
    'Groceries': M.mode === 'dark' ? 'rgba(16,185,129,0.18)' : '#E0EFDB',
    'Dining':    M.mode === 'dark' ? 'rgba(239,68,68,0.18)'  : '#F6E0DB',
    'Transport': M.mode === 'dark' ? 'rgba(245,158,11,0.18)' : '#FBEFD4',
    'Housing':   M.mode === 'dark' ? 'rgba(99,102,241,0.20)' : '#E0E0F5',
    'Subscriptions': M.mode === 'dark' ? 'rgba(6,182,212,0.18)' : '#D8EFF5',
    'Savings':   M.mode === 'dark' ? 'rgba(139,92,246,0.20)' : '#E5DCF5',
    'Entertainment': M.mode === 'dark' ? 'rgba(236,72,153,0.18)' : '#F8DDEC',
    'Health':    M.mode === 'dark' ? 'rgba(20,184,166,0.18)' : '#D4EFE9',
    'Income':    M.mode === 'dark' ? 'rgba(46,125,50,0.22)'  : '#D4EACD',
  };
  return map[cat] || (M.mode === 'dark' ? 'rgba(255,255,255,0.07)' : '#EFE7D7');
}
function mCatInk(cat) {
  return {
    'Groceries': '#10B981', 'Dining': '#EF4444', 'Transport': '#F59E0B',
    'Housing': '#6366F1', 'Subscriptions': '#06B6D4', 'Savings': '#8B5CF6',
    'Entertainment': '#EC4899', 'Health': '#14B8A6', 'Income': '#2E7D32',
  }[cat] || '#6B5F54';
}

// ───────── Hooks ─────────
function useCountUp(target, { duration = 900, start = 0, delay = 0 } = {}) {
  const [v, setV] = React.useState(start);
  React.useEffect(() => {
    let raf;
    const t0 = performance.now() + delay;
    const from = start;
    const diff = target - from;
    const tick = (now) => {
      const t = Math.max(0, now - t0);
      const p = Math.min(1, t / duration);
      // ease-out quart
      const eased = 1 - Math.pow(1 - p, 4);
      setV(from + diff * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);
  return v;
}

function useStagger(count, { step = 40, initial = 60 } = {}) {
  const [visible, setVisible] = React.useState(0);
  React.useEffect(() => {
    let t;
    const tick = (i) => {
      setVisible(i);
      if (i < count) t = setTimeout(() => tick(i + 1), step);
    };
    t = setTimeout(() => tick(1), initial);
    return () => clearTimeout(t);
  }, [count, step, initial]);
  return visible;
}

// ───────── Primitives ─────────
function MButton({ children, primary, size = 'md', onClick, style }) {
  const M = useMaple();
  const h = size === 'sm' ? 38 : size === 'lg' ? 54 : 46;
  const fs = size === 'sm' ? 13 : size === 'lg' ? 16 : 14;
  return (
    <button onClick={onClick} style={{
      height: h, padding: '0 18px', borderRadius: h / 2.6, border: 'none',
      background: primary ? M.accent : M.surface,
      color: primary ? '#fff' : M.ink,
      fontSize: fs, fontWeight: 600, fontFamily: M.font, letterSpacing: -0.1,
      boxShadow: primary ? M.shadow : `inset 0 0 0 1px ${M.hair}`,
      cursor: 'pointer', transition: 'transform .15s ease',
      ...style,
    }}
    onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.97)'}
    onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
    onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
    >{children}</button>
  );
}

function MCard({ children, padding = 18, style, onClick }) {
  const M = useMaple();
  return (
    <div onClick={onClick} style={{
      padding, borderRadius: 20, background: M.surface,
      border: `1px solid ${M.hair}`, boxShadow: M.shadow,
      ...style,
    }}>{children}</div>
  );
}

function MChip({ children, active, color, onClick }) {
  const M = useMaple();
  return (
    <div onClick={onClick} style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '6px 12px', borderRadius: 16,
      background: active ? (color || M.accent) : 'transparent',
      color: active ? '#fff' : M.ink2,
      border: `1px solid ${active ? (color || M.accent) : M.hair}`,
      fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: M.font,
    }}>{children}</div>
  );
}

// ───────── Label ─────────
function MLabel({ children, style }) {
  const M = useMaple();
  return <div style={{
    fontSize: 11, color: M.ink2, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase',
    ...style,
  }}>{children}</div>;
}

// Reveal wrapper — fades + translates up once `show` is true
function Reveal({ show = true, delay = 0, y = 8, children, style }) {
  return (
    <div style={{
      opacity: show ? 1 : 0,
      transform: show ? 'translateY(0)' : `translateY(${y}px)`,
      transition: `opacity 380ms ${delay}ms cubic-bezier(0.2,0.7,0.2,1), transform 380ms ${delay}ms cubic-bezier(0.2,0.7,0.2,1)`,
      ...style,
    }}>{children}</div>
  );
}

// Inline sheen shimmer used when numbers are hidden
function PrivacyBlur({ children, hidden }) {
  return (
    <span style={{
      filter: hidden ? 'blur(6px) saturate(0.8)' : 'none',
      transition: 'filter 280ms ease', display: 'inline-block',
    }}>{children}</span>
  );
}

Object.assign(window, {
  MAPLE_LIGHT, MAPLE_DARK, MapleTheme, useMaple, MapleCtx,
  mCatTint, mCatInk, useCountUp, useStagger,
  MButton, MCard, MChip, MLabel, Reveal, PrivacyBlur,
});
