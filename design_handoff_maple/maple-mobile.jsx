// maple-mobile.jsx — polished interactive mobile screens for Maple.

// ───────── iOS-style navigation primitive ─────────
function MTabBar({ active, onChange }) {
  const M = useMaple();
  const tabs = [
    { id: 'home', label: 'Home', icon: Icon.home },
    { id: 'tx', label: 'Activity', icon: Icon.list },
    { id: 'budget', label: 'Budget', icon: Icon.pie },
    { id: 'invest', label: 'Invest', icon: Icon.chart },
    { id: 'shared', label: 'Shared', icon: Icon.users },
  ];
  return (
    <div style={{
      position: 'absolute', bottom: 18, left: 12, right: 12, zIndex: 30,
      background: M.mode === 'dark' ? 'rgba(34,29,24,0.85)' : 'rgba(255,253,247,0.85)',
      backdropFilter: 'blur(24px) saturate(1.4)',
      WebkitBackdropFilter: 'blur(24px) saturate(1.4)',
      borderRadius: 26, padding: 5,
      display: 'flex', gap: 2,
      boxShadow: M.shadowHi,
      border: `1px solid ${M.hair}`,
    }}>
      {tabs.map(t => {
        const a = t.id === active;
        return (
          <div key={t.id} onClick={() => onChange && onChange(t.id)} style={{
            flex: 1, padding: '9px 4px', textAlign: 'center', borderRadius: 22,
            background: a ? M.accent : 'transparent',
            color: a ? '#fff' : M.ink2,
            fontSize: 11, fontWeight: 600, letterSpacing: -0.1, fontFamily: M.font,
            cursor: 'pointer', transition: 'background .2s ease',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
          }}>
            {t.icon(a ? '#fff' : M.ink2)}
            <span>{t.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function MFrame({ active, onTab, children, pad = true }) {
  const M = useMaple();
  return (
    <div style={{ position: 'relative', height: '100%', background: M.bg, fontFamily: M.font, color: M.ink, overflow: 'hidden' }}>
      <ScrollArea style={{ paddingTop: pad ? 56 : 0, paddingBottom: 110 }}>{children}</ScrollArea>
      <MTabBar active={active} onChange={onTab} />
    </div>
  );
}

// ───────── Onboarding (4-step with real progress) ─────────
function MOnboarding() {
  const M = useMaple();
  const [step, setStep] = React.useState(0);
  const steps = [
    { kicker: 'Welcome', title: <>Money, gently <em style={{ color: M.accent, fontStyle: 'italic' }}>in sync</em>.</>, sub: 'The household finance app for Canadians — with real CRA rules, shared expenses, and budgets that actually roll over.' },
    { kicker: 'Your people', title: <>Who's in your <em style={{ color: M.accent }}>household?</em></>, sub: 'Add partners or roommates. Everyone sees shared balances; personal accounts stay private.' },
    { kicker: 'Your accounts', title: <>Connect <em style={{ color: M.accent }}>everything.</em></>, sub: 'Chequing, savings, TFSA, RRSP, FHSA, credit cards. We track CRA room automatically.' },
    { kicker: 'All set', title: <>You're <em style={{ color: M.accent }}>ready</em>.</>, sub: "Amélie & Jordan's household is set up. Let's see where your money stands." },
  ];
  const cur = steps[step];

  return (
    <div style={{ position: 'relative', height: '100%', background: M.bg, fontFamily: M.font, color: M.ink, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 80, right: -32, opacity: M.mode === 'dark' ? 0.05 : 0.08, color: M.leaf }}>
        <svg width="180" height="180" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.4 3.6 3.8-1L15.6 8l4.4 2-4 2.2 1 4.4-4-1-1 3.4-1-3.4-4 1 1-4.4-4-2.2 4.4-2L8.8 4.6l3.8 1L12 2Z"/></svg>
      </div>

      <div style={{ position: 'absolute', inset: 0, padding: '78px 28px 38px', display: 'flex', flexDirection: 'column', zIndex: 2 }}>
        {/* Brand + progress */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: M.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {Icon.maple('#fff')}
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: -0.3 }}>Acorn</div>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', gap: 4 }}>
            {steps.map((_, i) => (
              <div key={i} style={{
                width: i === step ? 22 : 6, height: 6, borderRadius: 3,
                background: i <= step ? M.accent : M.hair,
                transition: 'width .35s ease, background .35s ease',
              }}/>
            ))}
          </div>
        </div>

        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: M.ink2, marginBottom: 14 }} key={`k${step}`}>
          <Reveal show>{cur.kicker} · step {step + 1} of 4</Reveal>
        </div>
        <div key={`t${step}`} style={{ fontFamily: M.serif, fontSize: 44, lineHeight: 1.04, letterSpacing: -1.4, fontWeight: 400, marginBottom: 14 }}>
          <Reveal show>{cur.title}</Reveal>
        </div>
        <div key={`s${step}`} style={{ fontSize: 15, color: M.ink2, lineHeight: 1.5 }}>
          <Reveal show delay={60}>{cur.sub}</Reveal>
        </div>

        {/* Step content */}
        <div style={{ marginTop: 26, flex: 1 }}>
          {step === 0 && (
            <Reveal show delay={140}>
              <MCard>
                <MLabel>What you get</MLabel>
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {['Track every dollar, joint or personal', 'Split shared expenses automatically', 'See CRA room across TFSA/RRSP/FHSA', 'Rollover budgets that actually work'].map(t => (
                    <div key={t} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <div style={{ width: 20, height: 20, borderRadius: 10, background: M.accentTint, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={M.accent} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m6 12 4 4 8-8"/></svg>
                      </div>
                      <div style={{ fontSize: 14, color: M.ink, lineHeight: 1.4 }}>{t}</div>
                    </div>
                  ))}
                </div>
              </MCard>
            </Reveal>
          )}
          {step === 1 && (
            <Reveal show delay={140}>
              <MCard>
                <MLabel>Your household</MLabel>
                <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {DATA.members.map((m, i) => (
                    <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: M.surface2, borderRadius: 12 }}>
                      <div style={{ width: 40, height: 40, borderRadius: 20, background: i === 0 ? M.butter : M.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 500, fontFamily: M.serif, color: M.ink }}>{m.initial}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 500 }}>{m.name}</div>
                        <div style={{ fontSize: 12, color: M.ink2 }}>{i === 0 ? 'Admin · you' : 'Partner · invited'}</div>
                      </div>
                      <div style={{ fontSize: 11, color: i === 0 ? M.accent : M.ink3, fontWeight: 600 }}>{i === 0 ? 'Active' : 'Pending'}</div>
                    </div>
                  ))}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 12, border: `1.5px dashed ${M.hair}` }}>
                    <div style={{ width: 40, height: 40, borderRadius: 20, background: M.hair2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{Icon.plus(M.ink2)}</div>
                    <div style={{ fontSize: 14, color: M.ink2 }}>Add someone</div>
                  </div>
                </div>
              </MCard>
            </Reveal>
          )}
          {step === 2 && (
            <Reveal show delay={140}>
              <MCard>
                <MLabel>Connect accounts</MLabel>
                <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {['RBC', 'EQ Bank', 'Wealthsimple', 'Questrade', 'Tangerine', 'TD'].map((b, i) => (
                    <div key={b} style={{ padding: 14, background: M.surface2, borderRadius: 12, border: `1px solid ${M.hair}`, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 24, height: 24, borderRadius: 6, background: ['#005DAA','#00A88F',M.accent,M.honey,M.leaf,'#12B886'][i], display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 700, fontFamily: M.serif }}>{b[0]}</div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{b}</div>
                      {i < 3 && <div style={{ marginLeft: 'auto', width: 6, height: 6, borderRadius: 3, background: M.up }}/>}
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 11, color: M.ink2, marginTop: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={M.accent} strokeWidth="2"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
                  Read-only · bank-level encryption
                </div>
              </MCard>
            </Reveal>
          )}
          {step === 3 && (
            <Reveal show delay={140}>
              <MCard padding={22} style={{ textAlign: 'center', background: `linear-gradient(150deg, ${M.accent} 0%, ${M.accentDeep} 100%)`, color: '#fff', border: 'none' }}>
                <div style={{ fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 700, opacity: 0.7 }}>Your net worth today</div>
                <div style={{ fontFamily: M.serif, fontSize: 42, letterSpacing: -1.2, marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>{fmtCAD(DATA.netWorth)}</div>
                <div style={{ fontSize: 13, opacity: 0.75, marginTop: 4 }}>across 7 accounts · 2 members</div>
              </MCard>
            </Reveal>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          {step > 0 && <MButton onClick={() => setStep(s => s - 1)} style={{ flex: 1 }}>Back</MButton>}
          <MButton primary size="lg" onClick={() => setStep(s => Math.min(3, s + 1))} style={{ flex: 2 }}>
            {step === 3 ? 'Open Acorn →' : 'Continue'}
          </MButton>
        </div>
      </div>
    </div>
  );
}

// ───────── Dashboard (balance reveal + chart scrub + flippable cards) ─────────
function MDashboard() {
  const M = useMaple();
  const [showBal, setShowBal] = React.useState(false);
  React.useEffect(() => { const t = setTimeout(() => setShowBal(true), 180); return () => clearTimeout(t); }, []);
  const bal = useCountUp(showBal ? DATA.netWorth : 0, { duration: 1200 });
  const delta = useCountUp(showBal ? DATA.netWorth - DATA.netWorthLast : 0, { duration: 1200 });
  const [hidden, setHidden] = React.useState(false);
  const [range, setRange] = React.useState('1Y');
  const [flipped, setFlipped] = React.useState({});
  const svgRef = React.useRef(null);
  const [scrub, setScrub] = React.useState(null);

  const ranges = ['1W', '1M', '3M', 'YTD', '1Y', 'ALL'];
  const trail = DATA.netWorthTrail;
  const pts = seriesToPoints(trail, 320, 110, { pad: 6 });
  const path = smoothPath(pts);
  const area = `${path} L${pts[pts.length-1][0]},110 L${pts[0][0]},110 Z`;

  const onMove = (e) => {
    const r = svgRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(r.width, e.clientX - r.left));
    const i = Math.round((x / r.width) * (trail.length - 1));
    setScrub({ i, x: (x / r.width) * 320 });
  };

  const showStagger = useStagger(8, { initial: 220, step: 55 });

  return (
    <MFrame active="home">
      {/* Header */}
      <div style={{ padding: '6px 22px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 13, color: M.ink2 }}>{DATA.month}</div>
          <div style={{ fontFamily: M.serif, fontSize: 30, letterSpacing: -0.8, lineHeight: 1, marginTop: 2 }}>Bonjour, Amélie</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div onClick={() => setHidden(h => !h)} style={{ width: 36, height: 36, borderRadius: 18, background: M.surface, border: `1px solid ${M.hair}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            {hidden ? Icon.eyeOff(M.ink2) : Icon.eye(M.ink2)}
          </div>
          <div style={{ display: 'flex' }}>
            <div style={{ width: 36, height: 36, borderRadius: 18, background: M.butter, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 600, fontFamily: M.serif, border: `2px solid ${M.bg}`, color: M.ink }}>A</div>
            <div style={{ width: 36, height: 36, borderRadius: 18, background: M.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 600, fontFamily: M.serif, border: `2px solid ${M.bg}`, marginLeft: -10, color: M.ink }}>J</div>
          </div>
        </div>
      </div>

      {/* Net worth hero */}
      <div style={{
        margin: '0 16px', padding: 22, borderRadius: 24,
        background: `linear-gradient(150deg, ${M.accent} 0%, ${M.accentDeep} 100%)`,
        color: '#fff', position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: -30, right: -30, opacity: 0.1, color: '#fff' }}>
          <svg width="160" height="160" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.4 3.6 3.8-1L15.6 8l4.4 2-4 2.2 1 4.4-4-1-1 3.4-1-3.4-4 1 1-4.4-4-2.2 4.4-2L8.8 4.6l3.8 1L12 2Z"/></svg>
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase' }}>Net worth</div>
        <div style={{ fontFamily: M.serif, fontSize: 44, letterSpacing: -1.4, marginTop: 4, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
          <PrivacyBlur hidden={hidden}>
            {scrub ? fmtCAD(trail[scrub.i]) : fmtCAD(bal)}
          </PrivacyBlur>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: 13 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 3, color: '#9AD8B4', fontWeight: 600 }}>
            {Icon.arrowUp('#9AD8B4')}
            <PrivacyBlur hidden={hidden}>{scrub ? '—' : `+${fmtCAD(delta)}`}</PrivacyBlur>
          </div>
          <div style={{ color: 'rgba(255,255,255,0.55)' }}>{scrub ? `${['May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar','Apr'][scrub.i]} 2026` : 'this month · +6.8%'}</div>
        </div>
        {/* Chart */}
        <div style={{ position: 'relative', marginTop: 14 }}>
          <svg ref={svgRef} width="100%" height="110" viewBox="0 0 320 110"
            onMouseMove={onMove} onMouseLeave={() => setScrub(null)}
            onTouchMove={(e) => { const t = e.touches[0]; onMove({ clientX: t.clientX }); }}
            onTouchEnd={() => setScrub(null)}
            style={{ display: 'block', cursor: 'crosshair' }}>
            <defs>
              <linearGradient id="m-area-d" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#9AD8B4" stopOpacity="0.35"/>
                <stop offset="100%" stopColor="#9AD8B4" stopOpacity="0"/>
              </linearGradient>
            </defs>
            <path d={area} fill="url(#m-area-d)"/>
            <path d={path} fill="none" stroke="#9AD8B4" strokeWidth="2" strokeLinecap="round"/>
            {scrub && (
              <>
                <line x1={scrub.x} x2={scrub.x} y1={0} y2={110} stroke="rgba(255,255,255,0.4)" strokeDasharray="2 3"/>
                <circle cx={scrub.x} cy={pts[scrub.i][1]} r="5" fill="#9AD8B4" stroke="#fff" strokeWidth="2"/>
              </>
            )}
          </svg>
        </div>
        {/* range selector */}
        <div style={{ display: 'flex', gap: 4, marginTop: 10 }}>
          {ranges.map(r => (
            <div key={r} onClick={() => setRange(r)} style={{
              flex: 1, textAlign: 'center', padding: '5px 0', fontSize: 11, fontWeight: 600,
              borderRadius: 8, background: range === r ? 'rgba(255,255,255,0.18)' : 'transparent',
              color: range === r ? '#fff' : 'rgba(255,255,255,0.55)', cursor: 'pointer',
            }}>{r}</div>
          ))}
        </div>
      </div>

      {/* Three stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, padding: '14px 16px 0' }}>
        {[
          { l: 'Income', v: fmtCADshort(DATA.income), ink: M.up },
          { l: 'Spent', v: fmtCADshort(DATA.expenses), ink: M.ink },
          { l: 'Saved', v: `+${fmtCADshort(DATA.net)}`, ink: M.accent },
        ].map((s, i) => (
          <Reveal key={s.l} show={showStagger > i} delay={0}>
            <div style={{ padding: 14, background: M.surface, borderRadius: 18, border: `1px solid ${M.hair}` }}>
              <MLabel>{s.l}</MLabel>
              <div style={{ fontFamily: M.serif, fontSize: 22, color: s.ink, marginTop: 4, letterSpacing: -0.4, fontVariantNumeric: 'tabular-nums' }}>
                <PrivacyBlur hidden={hidden}>{s.v}</PrivacyBlur>
              </div>
            </div>
          </Reveal>
        ))}
      </div>

      {/* Accounts — flippable cards */}
      <div style={{ padding: '22px 22px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <MLabel>Accounts</MLabel>
        <div style={{ fontSize: 12, color: M.accent, fontWeight: 600, cursor: 'pointer' }}>See all</div>
      </div>
      <div style={{ padding: '0 16px', display: 'flex', gap: 10, overflowX: 'auto' }} className="hide-scroll">
        {DATA.accounts.slice(0, 5).map((a, i) => {
          const isFlipped = !!flipped[a.id];
          return (
            <Reveal key={a.id} show={showStagger > i + 3}>
              <div onClick={() => setFlipped(f => ({ ...f, [a.id]: !f[a.id] }))} style={{
                minWidth: 200, height: 136, perspective: 1000, cursor: 'pointer',
              }}>
                <div style={{
                  position: 'relative', width: '100%', height: '100%',
                  transformStyle: 'preserve-3d',
                  transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0)',
                  transition: 'transform .55s cubic-bezier(0.4,0,0.2,1)',
                }}>
                  {/* front */}
                  <div style={{
                    position: 'absolute', inset: 0, padding: 16, borderRadius: 18,
                    background: M.surface, border: `1px solid ${M.hair}`,
                    backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden',
                    display: 'flex', flexDirection: 'column',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.6, color: M.ink2, textTransform: 'uppercase' }}>{a.type.replace('_',' ')}</div>
                      <div style={{ width: 8, height: 8, borderRadius: 4, background: a.owner === 'shared' ? M.leaf : M.accent }}/>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 500, marginTop: 10 }}>{a.name}</div>
                    <div style={{ fontFamily: M.serif, fontSize: 24, letterSpacing: -0.5, marginTop: 6, fontVariantNumeric: 'tabular-nums', color: a.balance < 0 ? M.down : M.ink }}>
                      <PrivacyBlur hidden={hidden}>{fmtCADshort(Math.abs(a.balance))}</PrivacyBlur>
                    </div>
                    <div style={{ flex: 1 }} />
                    <div style={{ fontSize: 11, color: M.ink2 }}>{a.bank} · tap to flip</div>
                  </div>
                  {/* back */}
                  <div style={{
                    position: 'absolute', inset: 0, padding: 16, borderRadius: 18,
                    background: M.accent, color: '#fff',
                    backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden',
                    transform: 'rotateY(180deg)',
                    display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                  }}>
                    <div>
                      <div style={{ fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase', opacity: 0.7, fontWeight: 700 }}>•••• last 4</div>
                      <div style={{ fontFamily: M.serif, fontSize: 22, letterSpacing: 2, marginTop: 4 }}>•••• {String(4100 + i * 77).slice(-4)}</div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', fontSize: 11 }}>
                      <div>
                        <div style={{ opacity: 0.6, marginBottom: 2 }}>Available</div>
                        <div style={{ fontFamily: M.serif, fontSize: 18 }}>{fmtCADshort(Math.max(0, a.balance))}</div>
                      </div>
                      <div style={{ opacity: 0.7 }}>APR 29</div>
                    </div>
                  </div>
                </div>
              </div>
            </Reveal>
          );
        })}
      </div>

      {/* Spending breakdown */}
      <div style={{ padding: '22px 22px 8px' }}><MLabel>Where it went</MLabel></div>
      <div style={{ margin: '0 16px 16px', padding: 18, background: M.surface, borderRadius: 20, border: `1px solid ${M.hair}` }}>
        <div style={{ display: 'flex', height: 10, borderRadius: 6, overflow: 'hidden', gap: 1, background: M.bg }}>
          {DATA.budgets.slice(0, 6).map(b => (
            <div key={b.cat} style={{ flex: b.actual, background: b.color }}/>
          ))}
        </div>
        <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {DATA.budgets.slice(0, 6).map(b => (
            <div key={b.cat} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: b.color }}/>
              <div style={{ fontSize: 13, fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.cat}</div>
              <div style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', color: M.ink2, fontWeight: 500 }}>
                <PrivacyBlur hidden={hidden}>{fmtCADshort(b.actual)}</PrivacyBlur>
              </div>
            </div>
          ))}
        </div>
      </div>
    </MFrame>
  );
}

// ───────── Transactions (stagger-in + swipe to reveal actions) ─────────
function SwipeRow({ t, M, delay }) {
  const [open, setOpen] = React.useState(false);
  const [dragX, setDragX] = React.useState(0);
  const [visible, setVisible] = React.useState(false);
  const startX = React.useRef(0);
  const tracking = React.useRef(false);

  React.useEffect(() => {
    const id = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(id);
  }, [delay]);

  const down = (e) => {
    tracking.current = true;
    startX.current = (e.touches ? e.touches[0].clientX : e.clientX) - (open ? -120 : 0);
  };
  const move = (e) => {
    if (!tracking.current) return;
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - startX.current;
    setDragX(Math.max(-120, Math.min(0, x)));
  };
  const up = () => {
    tracking.current = false;
    if (dragX < -50) { setOpen(true); setDragX(-120); }
    else { setOpen(false); setDragX(0); }
  };

  return (
    <div style={{
      position: 'relative', borderRadius: 14, overflow: 'hidden', marginBottom: 6,
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0) scale(1)' : 'translateY(8px) scale(0.98)',
      transition: 'opacity 320ms cubic-bezier(0.2,0.7,0.2,1), transform 320ms cubic-bezier(0.2,0.7,0.2,1)',
    }}>
      {/* action reveal (behind) */}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', justifyContent: 'flex-end' }}>
        <div style={{ width: 60, background: M.accentTint, color: M.accent, fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Split</div>
        <div style={{ width: 60, background: M.leafSoft, color: M.leaf, fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Delete</div>
      </div>
      {/* foreground row */}
      <div
        onMouseDown={down} onMouseMove={move} onMouseUp={up} onMouseLeave={up}
        onTouchStart={down} onTouchMove={move} onTouchEnd={up}
        style={{
          display: 'flex', alignItems: 'center', padding: '12px 16px',
          background: M.surface, border: `1px solid ${M.hair2}`,
          transform: `translateX(${dragX}px)`, transition: tracking.current ? 'none' : 'transform .28s cubic-bezier(0.2,0.7,0.2,1)',
          userSelect: 'none', cursor: 'grab', borderRadius: 14,
        }}>
        <div style={{
          width: 38, height: 38, borderRadius: 19,
          background: mCatTint(t.cat, M), color: mCatInk(t.cat),
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: M.serif, fontSize: 15, fontWeight: 500,
        }}>{t.merchant.charAt(0)}</div>
        <div style={{ flex: 1, marginLeft: 12, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 500 }}>{t.merchant}</div>
          <div style={{ fontSize: 11, color: M.ink2, marginTop: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>{t.cat}</span>
            {t.shared && <span style={{ color: M.leaf, fontWeight: 600 }}>· split</span>}
            {t.member !== 'shared' && <span>· {t.member === 'a' ? 'Amélie' : 'Jordan'}</span>}
          </div>
        </div>
        <div style={{ fontFamily: M.serif, fontSize: 16, letterSpacing: -0.3, fontVariantNumeric: 'tabular-nums', color: t.amount > 0 ? M.up : M.ink }}>
          {t.amount > 0 ? '+' : '−'}{fmtCAD(Math.abs(t.amount))}
        </div>
      </div>
    </div>
  );
}

function MTransactions() {
  const M = useMaple();
  const [filter, setFilter] = React.useState('all');
  const tx = DATA.transactions.filter(t => {
    if (filter === 'shared') return t.shared;
    if (filter === 'a') return t.member === 'a';
    if (filter === 'j') return t.member === 'j';
    return true;
  });

  return (
    <MFrame active="tx">
      <div style={{ padding: '6px 22px 8px' }}>
        <div style={{ fontSize: 13, color: M.ink2 }}>{DATA.month}</div>
        <div style={{ fontFamily: M.serif, fontSize: 36, letterSpacing: -1, lineHeight: 1 }}>Activity</div>
      </div>

      <div style={{ display: 'flex', gap: 8, padding: '10px 16px 10px' }}>
        <div style={{ flex: 1, padding: '10px 14px', background: M.surface, borderRadius: 14, border: `1px solid ${M.hair}`, display: 'flex', alignItems: 'center', gap: 8 }}>
          {Icon.search(M.ink3)}
          <div style={{ fontSize: 14, color: M.ink3 }}>Search merchants, amounts…</div>
        </div>
        <div style={{ width: 44, height: 44, borderRadius: 14, background: M.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
          {Icon.plus('#fff')}
        </div>
      </div>

      {/* Chip filters */}
      <div style={{ display: 'flex', gap: 6, padding: '0 16px 12px', overflowX: 'auto' }} className="hide-scroll">
        {[['all','All'],['shared','Shared'],['a','Amélie'],['j','Jordan']].map(([id, lbl]) => (
          <MChip key={id} active={filter === id} onClick={() => setFilter(id)}>{lbl}</MChip>
        ))}
      </div>

      {/* Totals */}
      <div style={{ display: 'flex', padding: '0 16px 14px', gap: 8 }}>
        {[
          { l: 'Inflow', v: `+${fmtCADshort(DATA.income)}`, ink: M.up, bg: M.mode === 'dark' ? 'rgba(127,201,167,0.14)' : '#E0EFDB' },
          { l: 'Outflow', v: fmtCADshort(-DATA.expenses), ink: M.down, bg: M.mode === 'dark' ? 'rgba(232,106,80,0.14)' : '#F6E0DB' },
          { l: 'Net', v: `+${fmtCADshort(DATA.net)}`, ink: M.accent, bg: M.accentSoft },
        ].map(s => (
          <div key={s.l} style={{ flex: 1, padding: '10px 12px', background: s.bg, borderRadius: 14 }}>
            <div style={{ fontSize: 10, color: M.ink2, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>{s.l}</div>
            <div style={{ fontFamily: M.serif, fontSize: 18, color: s.ink, fontVariantNumeric: 'tabular-nums' }}>{s.v}</div>
          </div>
        ))}
      </div>

      {/* list */}
      <div style={{ margin: '0 16px' }}>
        {tx.map((t, i) => {
          const showHead = i === 0 || tx[i-1].date !== t.date;
          return (
            <React.Fragment key={t.id}>
              {showHead && (
                <div style={{ fontSize: 11, color: M.ink2, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', padding: '12px 4px 6px' }}>{t.date}</div>
              )}
              <SwipeRow t={t} M={M} delay={60 + i * 35} />
            </React.Fragment>
          );
        })}
      </div>
      <div style={{ height: 20 }} />
    </MFrame>
  );
}

Object.assign(window, { MOnboarding, MDashboard, MTransactions, MFrame, MTabBar });
