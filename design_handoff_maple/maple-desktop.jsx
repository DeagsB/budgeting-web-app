// maple-desktop.jsx — Desktop layouts for Maple direction.
// Two-column: left sidebar nav + main content area. Uses the same primitives.

function MDesktopShell({ active, onNav, children, title, subtitle, right }) {
  const M = useMaple();
  const nav = [
    { id: 'home', label: 'Overview', icon: Icon.home },
    { id: 'tx', label: 'Activity', icon: Icon.list },
    { id: 'budget', label: 'Budgets', icon: Icon.pie },
    { id: 'invest', label: 'Investments', icon: Icon.chart },
    { id: 'shared', label: 'Shared', icon: Icon.users },
    { id: 'settings', label: 'Settings', icon: Icon.settings },
  ];
  return (
    <div style={{ display: 'flex', height: '100%', background: M.bg, color: M.ink, fontFamily: M.font }}>
      {/* Sidebar */}
      <div style={{ width: 240, background: M.surface, borderRight: `1px solid ${M.hair}`, padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 8px 20px' }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: M.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{Icon.maple('#fff')}</div>
          <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: -0.3 }}>Acorn</div>
        </div>
        <div style={{ fontSize: 10, color: M.ink3, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 700, padding: '6px 12px 6px' }}>Household</div>
        {nav.map(n => (
          <div key={n.id} onClick={() => onNav && onNav(n.id)} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10,
            background: n.id === active ? M.accentTint : 'transparent',
            color: n.id === active ? M.accent : M.ink2,
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>
            {n.icon(n.id === active ? M.accent : M.ink2)}
            <span>{n.label}</span>
          </div>
        ))}
        <div style={{ flex: 1 }} />
        <div style={{ padding: 12, background: M.bg, borderRadius: 12, border: `1px solid ${M.hair}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <div style={{ width: 28, height: 28, borderRadius: 14, background: M.butter, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 500, fontFamily: M.serif }}>A</div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 500 }}>Amélie T.</div>
              <div style={{ fontSize: 10, color: M.ink2 }}>Tremblay–Osei</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main */}
      <div style={{ flex: 1, overflow: 'auto' }} className="hide-scroll">
        <div style={{ padding: '28px 36px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: `1px solid ${M.hair}` }}>
          <div>
            <div style={{ fontSize: 12, color: M.ink2, letterSpacing: 0.4, textTransform: 'uppercase', fontWeight: 600 }}>{subtitle || DATA.month}</div>
            <div style={{ fontFamily: M.serif, fontSize: 38, letterSpacing: -1.2, marginTop: 4, lineHeight: 1 }}>{title}</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>{right}</div>
        </div>
        <div style={{ padding: '24px 36px 40px' }}>{children}</div>
      </div>
    </div>
  );
}

// ───────── Desktop: Dashboard ─────────
function MDesktopDashboard() {
  const M = useMaple();
  const trail = DATA.netWorthTrail;
  const pts = seriesToPoints(trail, 620, 180, { pad: 8 });
  const path = smoothPath(pts);
  const area = `${path} L${pts[pts.length-1][0]},180 L${pts[0][0]},180 Z`;
  const [showVal, setShowVal] = React.useState(false);
  React.useEffect(() => { const t = setTimeout(() => setShowVal(true), 180); return () => clearTimeout(t); }, []);
  const bal = useCountUp(showVal ? DATA.netWorth : 0, { duration: 1200 });

  return (
    <MDesktopShell active="home" title="Bonjour, Amélie"
      right={<><MButton>Export</MButton><MButton primary>+ Transaction</MButton></>}
    >
      {/* Top row: hero + three stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
        <div style={{
          padding: 28, borderRadius: 22, color: '#fff',
          background: `linear-gradient(150deg, ${M.accent} 0%, ${M.accentDeep} 100%)`,
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', top: -40, right: -40, opacity: 0.08 }}>
            <svg width="220" height="220" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.4 3.6 3.8-1L15.6 8l4.4 2-4 2.2 1 4.4-4-1-1 3.4-1-3.4-4 1 1-4.4-4-2.2 4.4-2L8.8 4.6l3.8 1L12 2Z"/></svg>
          </div>
          <div style={{ fontSize: 11, opacity: 0.7, letterSpacing: 0.8, textTransform: 'uppercase', fontWeight: 700 }}>Net worth · April 2026</div>
          <div style={{ fontFamily: M.serif, fontSize: 64, letterSpacing: -2.2, marginTop: 8, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{fmtCAD(bal)}</div>
          <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 13 }}>
            <div style={{ color: '#9AD8B4', fontWeight: 600 }}>↑ +$13,676.70 this month</div>
            <div style={{ opacity: 0.6 }}>+6.8% MoM</div>
            <div style={{ opacity: 0.6 }}>+42.3% YoY</div>
          </div>
          <svg width="100%" height="180" viewBox="0 0 620 180" style={{ marginTop: 20 }}>
            <defs>
              <linearGradient id="dsk-area" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#9AD8B4" stopOpacity="0.32"/>
                <stop offset="100%" stopColor="#9AD8B4" stopOpacity="0"/>
              </linearGradient>
            </defs>
            {[0,1,2,3].map(i => (
              <line key={i} x1="0" y1={45*i + 10} x2="620" y2={45*i + 10} stroke="rgba(255,255,255,0.12)" strokeWidth="0.5"/>
            ))}
            <path d={area} fill="url(#dsk-area)"/>
            <path d={path} fill="none" stroke="#9AD8B4" strokeWidth="2.2" strokeLinecap="round"/>
          </svg>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[
            { l: 'Income this month', v: fmtCAD(DATA.income), sub: '2 payroll deposits', ink: M.up },
            { l: 'Spent this month', v: fmtCAD(DATA.expenses), sub: '$121 over dining pace', ink: M.ink },
            { l: 'Saved', v: fmtCAD(DATA.net), sub: '51.6% savings rate', ink: M.accent },
          ].map(s => (
            <div key={s.l} style={{ padding: 20, background: M.surface, borderRadius: 18, border: `1px solid ${M.hair}`, flex: 1 }}>
              <MLabel>{s.l}</MLabel>
              <div style={{ fontFamily: M.serif, fontSize: 28, color: s.ink, marginTop: 6, letterSpacing: -0.7, fontVariantNumeric: 'tabular-nums' }}>{s.v}</div>
              <div style={{ fontSize: 12, color: M.ink2, marginTop: 4 }}>{s.sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Accounts + Spending */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
        <div style={{ padding: 22, background: M.surface, borderRadius: 20, border: `1px solid ${M.hair}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
            <div style={{ fontFamily: M.serif, fontSize: 22, letterSpacing: -0.4 }}>Accounts</div>
            <div style={{ fontSize: 12, color: M.accent, fontWeight: 600, cursor: 'pointer' }}>See all →</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {DATA.accounts.map((a, i) => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', padding: '12px 0', borderBottom: i < DATA.accounts.length - 1 ? `1px solid ${M.hair2}` : 'none' }}>
                <div style={{ width: 4, alignSelf: 'stretch', background: a.owner === 'shared' ? M.leaf : M.accent, borderRadius: 2, marginRight: 12 }}/>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{a.name}</div>
                  <div style={{ fontSize: 11, color: M.ink2, marginTop: 1 }}>{a.bank} · {a.type.replace('_', ' ')}</div>
                </div>
                <div style={{ fontFamily: M.serif, fontSize: 17, fontVariantNumeric: 'tabular-nums', color: a.balance < 0 ? M.down : M.ink }}>{fmtCAD(a.balance)}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding: 22, background: M.surface, borderRadius: 20, border: `1px solid ${M.hair}` }}>
          <div style={{ fontFamily: M.serif, fontSize: 22, letterSpacing: -0.4, marginBottom: 16 }}>Where it went</div>
          <div style={{ display: 'flex', height: 14, borderRadius: 8, overflow: 'hidden', gap: 1, background: M.bg, marginBottom: 16 }}>
            {DATA.budgets.map(b => (<div key={b.cat} style={{ flex: b.actual, background: b.color }}/>))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {DATA.budgets.map(b => (
              <div key={b.cat} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 10, height: 10, borderRadius: 3, background: b.color }}/>
                <div style={{ fontSize: 13, flex: 1 }}>{b.cat}</div>
                <div style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', color: M.ink2, fontWeight: 500 }}>{fmtCADshort(b.actual)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent activity */}
      <div style={{ marginTop: 16, padding: 22, background: M.surface, borderRadius: 20, border: `1px solid ${M.hair}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
          <div style={{ fontFamily: M.serif, fontSize: 22, letterSpacing: -0.4 }}>Recent activity</div>
          <div style={{ fontSize: 12, color: M.accent, fontWeight: 600, cursor: 'pointer' }}>View all →</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 160px 100px 140px', fontSize: 10, color: M.ink2, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', padding: '0 12px 10px', borderBottom: `1px solid ${M.hair}` }}>
          <div>Date</div><div>Merchant</div><div>Category</div><div>Member</div><div style={{ textAlign: 'right' }}>Amount</div>
        </div>
        {DATA.transactions.slice(0, 8).map(t => (
          <div key={t.id} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 160px 100px 140px', alignItems: 'center', padding: '12px', borderBottom: `1px solid ${M.hair2}` }}>
            <div style={{ fontSize: 12, color: M.ink2 }}>{t.date}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 28, height: 28, borderRadius: 14, background: mCatTint(t.cat, M), color: mCatInk(t.cat), display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: M.serif, fontSize: 12, fontWeight: 500 }}>{t.merchant[0]}</div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{t.merchant}</div>
              {t.shared && <div style={{ fontSize: 9, fontWeight: 700, color: M.leaf, letterSpacing: 0.4, textTransform: 'uppercase', padding: '2px 6px', background: M.leafSoft, borderRadius: 4 }}>Split</div>}
            </div>
            <div style={{ fontSize: 12, color: M.ink2 }}>{t.cat}</div>
            <div style={{ fontSize: 12, color: M.ink2 }}>{t.member === 'a' ? 'Amélie' : t.member === 'j' ? 'Jordan' : 'Shared'}</div>
            <div style={{ textAlign: 'right', fontFamily: M.serif, fontSize: 15, fontVariantNumeric: 'tabular-nums', color: t.amount > 0 ? M.up : M.ink }}>{t.amount > 0 ? '+' : '−'}{fmtCAD(Math.abs(t.amount))}</div>
          </div>
        ))}
      </div>
    </MDesktopShell>
  );
}

// ───────── Desktop: Investments ─────────
function MDesktopInvest() {
  const M = useMaple();
  const totalInvest = DATA.accounts.filter(a => ['tfsa','rrsp','fhsa'].includes(a.type)).reduce((s,a) => s + a.balance, 0);
  const trail = DATA.portfolioTrail;
  const pts = seriesToPoints(trail, 780, 200, { pad: 10 });
  const path = smoothPath(pts);
  const area = `${path} L${pts[pts.length-1][0]},200 L${pts[0][0]},200 Z`;

  return (
    <MDesktopShell active="invest" title="Investments" subtitle="2026 · tax year"
      right={<><MButton>Export</MButton><MButton primary>+ Contribution</MButton></>}
    >
      <div style={{ padding: 28, background: M.surface, borderRadius: 20, border: `1px solid ${M.hair}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <MLabel>Portfolio value</MLabel>
            <div style={{ fontFamily: M.serif, fontSize: 56, letterSpacing: -1.8, marginTop: 6, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{fmtCAD(totalInvest)}</div>
            <div style={{ display: 'flex', gap: 14, marginTop: 8, fontSize: 13 }}>
              <div style={{ color: M.up, fontWeight: 600 }}>↑ +$34,787 YTD</div>
              <div style={{ color: M.ink2 }}>+22.4% · 1Y</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 4, background: M.bg, borderRadius: 10, padding: 3 }}>
            {['1M','3M','YTD','1Y','5Y','MAX'].map((r, i) => (
              <div key={r} style={{ padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: i === 3 ? M.surface : 'transparent', color: i === 3 ? M.ink : M.ink2, cursor: 'pointer' }}>{r}</div>
            ))}
          </div>
        </div>
        <svg width="100%" height="200" viewBox="0 0 780 200" style={{ marginTop: 18 }}>
          <defs>
            <linearGradient id="di-area" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={M.accent} stopOpacity="0.22"/>
              <stop offset="100%" stopColor={M.accent} stopOpacity="0"/>
            </linearGradient>
          </defs>
          {[0,1,2,3,4].map(i => (
            <line key={i} x1="0" y1={40*i + 5} x2="780" y2={40*i + 5} stroke={M.hair} strokeWidth="0.5"/>
          ))}
          <path d={area} fill="url(#di-area)"/>
          <path d={path} fill="none" stroke={M.accent} strokeWidth="2.2" strokeLinecap="round"/>
        </svg>
      </div>

      {/* CRA + allocation */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginTop: 16 }}>
        <div style={{ padding: 22, background: M.surface, borderRadius: 20, border: `1px solid ${M.hair}` }}>
          <div style={{ fontFamily: M.serif, fontSize: 22, letterSpacing: -0.4, marginBottom: 16 }}>CRA room · 2026</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
            {['Amélie', 'Jordan'].map(m => (
              <div key={m}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 14, background: m === 'Amélie' ? M.butter : M.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 500, fontFamily: M.serif }}>{m[0]}</div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{m}</div>
                </div>
                {DATA.contributions.filter(c => c.member === m).map((c, i) => {
                  const p = c.contributed / c.room;
                  const avail = c.room - c.contributed;
                  return (
                    <div key={i} style={{ marginBottom: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 8, height: 8, borderRadius: 2, background: c.color }}/>
                          <span style={{ fontWeight: 600 }}>{c.type}</span>
                        </div>
                        <span style={{ color: M.ink2, fontVariantNumeric: 'tabular-nums' }}>{fmtCAD(c.contributed)} / {fmtCAD(c.room)}</span>
                      </div>
                      <div style={{ height: 5, borderRadius: 3, background: M.bgDeep, overflow: 'hidden' }}>
                        <div style={{ width: `${p*100}%`, height: '100%', background: c.color }}/>
                      </div>
                      <div style={{ fontSize: 11, color: avail > 0 ? M.accent : M.ink3, fontWeight: 600, marginTop: 4 }}>
                        {avail > 0 ? `${fmtCAD(avail)} available` : 'Fully contributed'}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding: 22, background: M.surface, borderRadius: 20, border: `1px solid ${M.hair}` }}>
          <div style={{ fontFamily: M.serif, fontSize: 22, letterSpacing: -0.4, marginBottom: 16 }}>Allocation</div>
          <svg width="100%" height="140" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="44" fill="none" stroke={M.bgDeep} strokeWidth="16"/>
            {(() => {
              const c = 2 * Math.PI * 44;
              const slices = [{p:0.445,c:'#10B981'},{p:0.471,c:'#6366F1'},{p:0.084,c:'#F59E0B'}];
              let acc = 0;
              return slices.map((s, i) => {
                const seg = <circle key={i} cx="60" cy="60" r="44" fill="none" stroke={s.c} strokeWidth="16" strokeDasharray={`${s.p * c} ${c}`} strokeDashoffset={-acc * c} transform="rotate(-90 60 60)"/>;
                acc += s.p;
                return seg;
              });
            })()}
          </svg>
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { l: 'TFSA', v: 8433900, p: 44.5, c: '#10B981' },
              { l: 'RRSP', v: 8934800, p: 47.1, c: '#6366F1' },
              { l: 'FHSA', v: 1600000, p: 8.4, c: '#F59E0B' },
            ].map(s => (
              <div key={s.l} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 10, height: 10, borderRadius: 3, background: s.c }}/>
                <div style={{ fontSize: 13, flex: 1 }}>{s.l}</div>
                <div style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', color: M.ink2 }}>{fmtCAD(s.v)}</div>
                <div style={{ fontSize: 12, fontWeight: 600, minWidth: 44, textAlign: 'right' }}>{s.p}%</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </MDesktopShell>
  );
}

Object.assign(window, { MDesktopShell, MDesktopDashboard, MDesktopInvest });
