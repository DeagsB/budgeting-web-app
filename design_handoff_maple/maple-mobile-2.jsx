// maple-mobile-2.jsx — Budgets, Investments, Shared for Maple (interactive).

// ───────── Budgets (animated ring + expandable category rows) ─────────
function MBudgets() {
  const M = useMaple();
  const totalB = DATA.budgets.reduce((s, b) => s + b.budget, 0);
  const totalA = DATA.budgets.reduce((s, b) => s + b.actual, 0);
  const [expanded, setExpanded] = React.useState(null);
  const [animate, setAnimate] = React.useState(false);
  React.useEffect(() => { const t = setTimeout(() => setAnimate(true), 200); return () => clearTimeout(t); }, []);

  const circ = 2 * Math.PI * 50;

  return (
    <MFrame active="budget">
      <div style={{ padding: '6px 22px 8px' }}>
        <div style={{ fontSize: 13, color: M.ink2 }}>{DATA.month} · day 19 of 30</div>
        <div style={{ fontFamily: M.serif, fontSize: 36, letterSpacing: -1, lineHeight: 1 }}>Budget</div>
      </div>

      {/* Hero ring */}
      <div style={{ margin: '0 16px 14px', padding: '26px 22px 22px', background: M.surface, borderRadius: 24, border: `1px solid ${M.hair}`, display: 'flex', alignItems: 'center', gap: 18 }}>
        <div style={{ position: 'relative', width: 130, height: 130 }}>
          <svg width="130" height="130" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="50" fill="none" stroke={M.bgDeep} strokeWidth="12"/>
            {(() => {
              let acc = 0;
              return DATA.budgets.map((b) => {
                const frac = animate ? b.actual / totalA : 0;
                const seg = <circle key={b.cat} cx="60" cy="60" r="50" fill="none"
                  stroke={b.color} strokeWidth="12"
                  strokeDasharray={`${frac * circ} ${circ}`}
                  strokeDashoffset={-acc * circ}
                  transform="rotate(-90 60 60)"
                  style={{ transition: 'stroke-dasharray 1.1s cubic-bezier(0.2,0.7,0.2,1)' }}/>;
                acc += frac;
                return seg;
              });
            })()}
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ fontSize: 10, color: M.ink2, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase' }}>Spent</div>
            <div style={{ fontFamily: M.serif, fontSize: 22, letterSpacing: -0.4, fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>{fmtCADshort(totalA)}</div>
            <div style={{ fontSize: 10, color: M.ink2, marginTop: 2 }}>of {fmtCADshort(totalB)}</div>
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, color: M.ink2, lineHeight: 1.4 }}>11 days left this month</div>
          <div style={{ fontFamily: M.serif, fontSize: 20, marginTop: 8, letterSpacing: -0.4, lineHeight: 1.15 }}>
            On track for <em style={{ color: M.accent, fontStyle: 'italic' }}>{fmtCADshort(DATA.net)}</em> saved.
          </div>
          <div style={{ fontSize: 12, color: M.ink2, marginTop: 6, lineHeight: 1.4 }}>Dining is $121 over pace — groceries are under.</div>
        </div>
      </div>

      {/* Category rows */}
      <div style={{ margin: '0 16px' }}>
        {DATA.budgets.map((b, i) => {
          const p = Math.min(1, b.actual / b.budget);
          const over = b.actual > b.budget;
          const isOpen = expanded === b.cat;
          const pct = over ? ` (${Math.round((b.actual / b.budget) * 100)}%)` : '';
          // fake daily trail for expanded state
          const trail = [3, 5, 2, 4, 6, 8, 3, 5, 4, 7, 6, 5, 9, 6, 4, 7, 5, 8, 6].map(n => n * (b.actual / 95));
          const trailPts = seriesToPoints(trail, 300, 50, { pad: 4 });
          return (
            <Reveal key={b.cat} show delay={120 + i * 50}>
              <div
                onClick={() => setExpanded(isOpen ? null : b.cat)}
                style={{
                  padding: 14, background: M.surface, borderRadius: 16,
                  border: `1px solid ${over ? M.down : M.hair2}`, marginBottom: 8, cursor: 'pointer',
                  boxShadow: over ? `0 0 0 3px ${M.leafSoft}` : 'none',
                  transition: 'box-shadow .2s ease',
                }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 10, background: b.color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ width: 10, height: 10, borderRadius: 3, background: b.color }}/>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{b.cat}{over && <span style={{ color: M.down, fontSize: 10, marginLeft: 8, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase' }}>Over</span>}</div>
                    <div style={{ fontSize: 11, color: M.ink2, marginTop: 1 }}>{fmtCAD(b.actual)} of {fmtCAD(b.budget)}{pct}</div>
                  </div>
                  <div style={{ fontFamily: M.serif, fontSize: 17, color: over ? M.down : M.ink, fontVariantNumeric: 'tabular-nums' }}>
                    {over ? `+${fmtCADshort(b.actual - b.budget)}` : `${Math.round((1-p)*100)}%`}
                  </div>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: M.bgDeep, overflow: 'hidden', marginTop: 10 }}>
                  <div style={{
                    width: animate ? `${p * 100}%` : '0%',
                    height: '100%', background: over ? M.down : b.color, borderRadius: 3,
                    transition: `width 1s cubic-bezier(0.2,0.7,0.2,1) ${i * 60}ms`,
                  }}/>
                </div>
                {isOpen && (
                  <div style={{ marginTop: 14 }}>
                    <MLabel>Daily spend · last 19 days</MLabel>
                    <svg width="100%" height="50" viewBox="0 0 300 50" style={{ marginTop: 8 }}>
                      <path d={`${smoothPath(trailPts)} L300,50 L0,50 Z`} fill={b.color} opacity="0.15"/>
                      <path d={smoothPath(trailPts)} fill="none" stroke={b.color} strokeWidth="1.5"/>
                    </svg>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: M.ink2, marginTop: 6 }}>
                      <span>Avg ${(b.actual / 1900).toFixed(0)}/day</span>
                      <span>Projected: {fmtCADshort(Math.round(b.actual * 1.58))}</span>
                    </div>
                  </div>
                )}
              </div>
            </Reveal>
          );
        })}
      </div>
      <div style={{ height: 30 }} />
    </MFrame>
  );
}

// ───────── Investments (scrubable chart + CRA per member + holdings bottom sheet) ─────────
function MInvest() {
  const M = useMaple();
  const totalInvest = DATA.accounts.filter(a => ['tfsa','rrsp','fhsa'].includes(a.type)).reduce((s,a) => s + a.balance, 0);
  const trail = DATA.portfolioTrail;
  const pts = seriesToPoints(trail, 320, 120, { pad: 6 });
  const path = smoothPath(pts);
  const area = `${path} L${pts[pts.length-1][0]},120 L${pts[0][0]},120 Z`;
  const svgRef = React.useRef(null);
  const [scrub, setScrub] = React.useState(null);
  const [showVal, setShowVal] = React.useState(false);
  React.useEffect(() => { const t = setTimeout(() => setShowVal(true), 180); return () => clearTimeout(t); }, []);
  const cur = useCountUp(showVal ? totalInvest : 0, { duration: 1200 });
  const ytdDelta = useCountUp(showVal ? 3478700 : 0, { duration: 1200 });

  const onMove = (e) => {
    const r = svgRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(r.width, e.clientX - r.left));
    const i = Math.round((x / r.width) * (trail.length - 1));
    setScrub({ i, x: (x / r.width) * 320 });
  };

  const slices = [
    { l: 'TFSA', v: 8433900, p: 0.445, c: '#10B981' },
    { l: 'RRSP', v: 8934800, p: 0.471, c: '#6366F1' },
    { l: 'FHSA', v: 1600000, p: 0.084, c: '#F59E0B' },
  ];
  const dcirc = 2 * Math.PI * 26;

  return (
    <MFrame active="invest">
      <div style={{ padding: '6px 22px 8px' }}>
        <div style={{ fontSize: 13, color: M.ink2 }}>2026 · tax year</div>
        <div style={{ fontFamily: M.serif, fontSize: 36, letterSpacing: -1, lineHeight: 1 }}>Investments</div>
      </div>

      {/* Portfolio hero */}
      <div style={{ margin: '0 16px 14px', padding: 22, background: M.surface, borderRadius: 24, border: `1px solid ${M.hair}` }}>
        <MLabel>Portfolio value</MLabel>
        <div style={{ fontFamily: M.serif, fontSize: 40, letterSpacing: -1.2, lineHeight: 1, marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>
          {scrub ? fmtCAD(trail[scrub.i]) : fmtCAD(cur)}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 3, color: M.up, fontWeight: 600, fontSize: 13 }}>
            {Icon.arrowUp(M.up)}
            <span>+{fmtCAD(ytdDelta)}</span>
          </div>
          <div style={{ fontSize: 12, color: M.ink2 }}>YTD · +22.4%</div>
        </div>

        <div style={{ position: 'relative', marginTop: 16 }}>
          <svg ref={svgRef} width="100%" height="120" viewBox="0 0 320 120"
            onMouseMove={onMove} onMouseLeave={() => setScrub(null)}
            onTouchMove={(e) => { const t = e.touches[0]; onMove({ clientX: t.clientX }); }}
            onTouchEnd={() => setScrub(null)}
            style={{ display: 'block', cursor: 'crosshair' }}>
            <defs>
              <linearGradient id="mi-area" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={M.accent} stopOpacity="0.28"/>
                <stop offset="100%" stopColor={M.accent} stopOpacity="0"/>
              </linearGradient>
            </defs>
            <path d={area} fill="url(#mi-area)"/>
            <path d={path} fill="none" stroke={M.accent} strokeWidth="2" strokeLinecap="round"/>
            {scrub && (
              <>
                <line x1={scrub.x} x2={scrub.x} y1={0} y2={120} stroke={M.hair} strokeDasharray="2 3"/>
                <circle cx={scrub.x} cy={pts[scrub.i][1]} r="5" fill={M.accent} stroke={M.surface} strokeWidth="2"/>
              </>
            )}
          </svg>
        </div>
      </div>

      {/* Allocation */}
      <div style={{ margin: '0 16px 14px', padding: 18, background: M.surface, borderRadius: 20, border: `1px solid ${M.hair}` }}>
        <MLabel>Allocation</MLabel>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 12 }}>
          <svg width="72" height="72" viewBox="0 0 64 64">
            <circle cx="32" cy="32" r="26" fill="none" stroke={M.bgDeep} strokeWidth="10"/>
            {(() => {
              let acc = 0;
              return slices.map((s, i) => {
                const seg = <circle key={i} cx="32" cy="32" r="26" fill="none"
                  stroke={s.c} strokeWidth="10"
                  strokeDasharray={`${(showVal ? s.p : 0) * dcirc} ${dcirc}`}
                  strokeDashoffset={-acc * dcirc}
                  transform="rotate(-90 32 32)"
                  style={{ transition: `stroke-dasharray 1s cubic-bezier(0.2,0.7,0.2,1) ${i * 120}ms` }}/>;
                acc += s.p;
                return seg;
              });
            })()}
          </svg>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
            {slices.map(s => (
              <div key={s.l} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: s.c }}/>
                <div style={{ fontSize: 13, flex: 1, fontWeight: 500 }}>{s.l}</div>
                <div style={{ fontSize: 12, color: M.ink2, fontVariantNumeric: 'tabular-nums' }}>{fmtCADshort(s.v)}</div>
                <div style={{ fontSize: 12, fontWeight: 600, fontVariantNumeric: 'tabular-nums', minWidth: 40, textAlign: 'right' }}>{(s.p*100).toFixed(1)}%</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CRA Room */}
      <div style={{ padding: '6px 22px 8px' }}><MLabel>CRA room · 2026</MLabel></div>
      {['Amélie', 'Jordan'].map(m => (
        <div key={m} style={{ margin: '0 16px 10px', padding: 18, background: M.surface, borderRadius: 20, border: `1px solid ${M.hair}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div style={{ width: 32, height: 32, borderRadius: 16, background: m === 'Amélie' ? M.butter : M.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 500, fontFamily: M.serif, color: M.ink }}>{m[0]}</div>
            <div style={{ fontFamily: M.serif, fontSize: 20, letterSpacing: -0.4 }}>{m}</div>
          </div>
          {DATA.contributions.filter(c => c.member === m).map((c, i) => {
            const p = c.contributed / c.room;
            const avail = c.room - c.contributed;
            return (
              <div key={i} style={{ marginBottom: i < 2 ? 14 : 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: c.color }}/>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{c.type}</div>
                    {avail === 0 && <div style={{ fontSize: 10, color: M.down, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase' }}>Maxed</div>}
                  </div>
                  <div style={{ fontSize: 12, color: M.ink2, fontVariantNumeric: 'tabular-nums' }}>
                    {fmtCADshort(c.contributed)} / {fmtCADshort(c.room)}
                  </div>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: M.bgDeep, overflow: 'hidden' }}>
                  <div style={{
                    width: showVal ? `${p*100}%` : 0, height: '100%', background: c.color, borderRadius: 3,
                    transition: `width 1s cubic-bezier(0.2,0.7,0.2,1) ${i * 80}ms`,
                  }}/>
                </div>
                <div style={{ fontSize: 11, color: avail > 0 ? M.accent : M.ink3, fontWeight: 600, marginTop: 4 }}>
                  {avail > 0 ? `${fmtCAD(avail)} room available` : 'Fully contributed'}
                </div>
              </div>
            );
          })}
        </div>
      ))}

      <div style={{ height: 30 }} />
    </MFrame>
  );
}

// ───────── Shared (balance + settlement flow + who-paid) ─────────
function MShared() {
  const M = useMaple();
  const shared = DATA.transactions.filter(t => t.shared);
  const [showDetail, setShowDetail] = React.useState(null);
  const [showVal, setShowVal] = React.useState(false);
  React.useEffect(() => { const t = setTimeout(() => setShowVal(true), 200); return () => clearTimeout(t); }, []);
  const amt = useCountUp(showVal ? DATA.sharedNet.amount : 0, { duration: 1200 });

  return (
    <MFrame active="shared">
      <div style={{ padding: '6px 22px 8px' }}>
        <div style={{ fontSize: 13, color: M.ink2 }}>{DATA.month}</div>
        <div style={{ fontFamily: M.serif, fontSize: 36, letterSpacing: -1, lineHeight: 1 }}>Shared</div>
      </div>

      {/* Settlement balance card */}
      <div style={{ margin: '0 16px 14px', padding: 22, borderRadius: 24,
        background: M.mode === 'dark' ? `linear-gradient(180deg, ${M.accentSoft} 0%, ${M.surface2} 100%)` : `linear-gradient(180deg, ${M.accentSoft} 0%, ${M.butter} 100%)`,
        border: `1px solid ${M.hair}`, position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <div style={{ display: 'flex' }}>
            <div style={{ width: 32, height: 32, borderRadius: 16, background: M.accentSoft, border: `2px solid ${M.surface}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 500, fontFamily: M.serif, color: M.ink }}>J</div>
            <div style={{ width: 16, height: 2, background: M.ink2, alignSelf: 'center', margin: '0 2px' }}/>
            <div style={{ fontSize: 18, color: M.ink2, alignSelf: 'center', margin: '0 4px' }}>→</div>
            <div style={{ width: 32, height: 32, borderRadius: 16, background: M.butter, border: `2px solid ${M.surface}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 500, fontFamily: M.serif, color: M.ink }}>A</div>
          </div>
          <MLabel style={{ marginLeft: 6 }}>Jordan owes Amélie</MLabel>
        </div>
        <div style={{ fontFamily: M.serif, fontSize: 44, letterSpacing: -1.4, marginTop: 4, color: M.accent, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
          {fmtCAD(amt)}
        </div>
        <div style={{ fontSize: 13, color: M.ink2, marginTop: 6 }}>Across 6 shared expenses this month</div>

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <MButton primary style={{ flex: 2 }}>Request e-transfer</MButton>
          <MButton style={{ flex: 1 }}>Mark paid</MButton>
        </div>
      </div>

      {/* Who paid bar */}
      <div style={{ margin: '0 16px 14px', padding: 16, background: M.surface, borderRadius: 18, border: `1px solid ${M.hair}` }}>
        <MLabel style={{ marginBottom: 10 }}>Who paid this month</MLabel>
        <div style={{ display: 'flex', height: 16, borderRadius: 8, overflow: 'hidden', background: M.bgDeep }}>
          <div style={{
            width: showVal ? '100%' : '0%', background: M.butter,
            display: 'flex', alignItems: 'center', paddingLeft: 10, fontSize: 10, fontWeight: 700, color: M.ink,
            transition: 'width 1s cubic-bezier(0.2,0.7,0.2,1)',
          }}>
            A · $329
          </div>
        </div>
        <div style={{ fontSize: 11, color: M.ink2, marginTop: 8, lineHeight: 1.4 }}>Jordan hasn't picked up any shared tabs this month. Amélie covered all 6.</div>
      </div>

      {/* Shared list — tap to detail */}
      <div style={{ padding: '6px 22px 8px' }}><MLabel>Shared this month</MLabel></div>
      <div style={{ margin: '0 16px' }}>
        {shared.map((t, i) => (
          <Reveal key={t.id} show delay={120 + i * 45}>
            <div onClick={() => setShowDetail(t)} style={{
              display: 'flex', alignItems: 'center', padding: 14, background: M.surface,
              borderRadius: 14, marginBottom: 6, border: `1px solid ${M.hair2}`, cursor: 'pointer',
            }}>
              <div style={{ width: 6, alignSelf: 'stretch', borderRadius: 3, background: mCatInk(t.cat), marginRight: 12 }}/>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{t.merchant}</div>
                <div style={{ fontSize: 11, color: M.ink2, marginTop: 1 }}>{t.date} · {t.cat} · split 50/50</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: M.serif, fontSize: 15, fontVariantNumeric: 'tabular-nums' }}>{fmtCAD(Math.abs(t.amount))}</div>
                <div style={{ fontSize: 10, color: M.accent, fontWeight: 600, marginTop: 2 }}>+{fmtCAD(Math.abs(t.amount)/2)} owed</div>
              </div>
            </div>
          </Reveal>
        ))}
      </div>
      <div style={{ height: 30 }} />

      {/* Detail bottom sheet */}
      {showDetail && (
        <div onClick={() => setShowDetail(null)} style={{
          position: 'absolute', inset: 0, zIndex: 60,
          background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'flex-end',
          animation: 'fadeIn 200ms ease',
        }}>
          <div onClick={(e) => e.stopPropagation()} style={{
            width: '100%', background: M.surface, borderRadius: '24px 24px 0 0',
            padding: '14px 22px 30px',
            animation: 'slideUp 280ms cubic-bezier(0.2,0.7,0.2,1)',
          }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: M.hair, margin: '0 auto 14px' }}/>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: 22, background: mCatTint(showDetail.cat, M), color: mCatInk(showDetail.cat), display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: M.serif, fontSize: 18, fontWeight: 500 }}>{showDetail.merchant[0]}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: M.serif, fontSize: 20, letterSpacing: -0.4 }}>{showDetail.merchant}</div>
                <div style={{ fontSize: 12, color: M.ink2 }}>{showDetail.date} · {showDetail.cat}</div>
              </div>
              <div style={{ fontFamily: M.serif, fontSize: 22, letterSpacing: -0.3, fontVariantNumeric: 'tabular-nums' }}>{fmtCAD(Math.abs(showDetail.amount))}</div>
            </div>

            <div style={{ marginTop: 16, padding: 14, background: M.bg, borderRadius: 14 }}>
              <MLabel>Split</MLabel>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <div style={{ flex: 1, padding: 10, background: M.surface, borderRadius: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 26, height: 26, borderRadius: 13, background: M.butter, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 500, fontFamily: M.serif }}>A</div>
                  <div style={{ flex: 1, fontSize: 12 }}>Paid · Amélie</div>
                  <div style={{ fontFamily: M.serif, fontVariantNumeric: 'tabular-nums', fontSize: 14 }}>{fmtCAD(Math.abs(showDetail.amount))}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <div style={{ flex: 1, padding: 10, background: M.surface, borderRadius: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 26, height: 26, borderRadius: 13, background: M.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 500, fontFamily: M.serif }}>J</div>
                  <div style={{ flex: 1, fontSize: 12 }}>Owes · Jordan</div>
                  <div style={{ fontFamily: M.serif, fontVariantNumeric: 'tabular-nums', fontSize: 14, color: M.accent, fontWeight: 600 }}>+{fmtCAD(Math.abs(showDetail.amount)/2)}</div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <MButton style={{ flex: 1 }}>Change split</MButton>
              <MButton primary style={{ flex: 1 }} onClick={() => setShowDetail(null)}>Done</MButton>
            </div>
          </div>
        </div>
      )}
    </MFrame>
  );
}

// Inject sheet animations + card back sheen (one-shot)
if (typeof document !== 'undefined' && !document.getElementById('maple-anim')) {
  const s = document.createElement('style');
  s.id = 'maple-anim';
  s.textContent = `
    @keyframes fadeIn { from{opacity:0} to{opacity:1} }
    @keyframes slideUp { from{transform:translateY(100%)} to{transform:translateY(0)} }
  `;
  document.head.appendChild(s);
}

Object.assign(window, { MBudgets, MInvest, MShared });
