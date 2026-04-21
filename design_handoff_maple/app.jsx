// app.jsx — design canvas showcasing Maple (light + dark, mobile + desktop)

const PHONE_W = 390;
const PHONE_H = 844;

function Phone({ children, dark, bg }) {
  return (
    <div style={{ width: PHONE_W, height: PHONE_H, background: bg || (dark ? '#181410' : '#F6F1E7'), position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 11, left: '50%', transform: 'translateX(-50%)', width: 120, height: 35, borderRadius: 22, background: '#000', zIndex: 100 }} />
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 56, zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 28px 0', color: dark ? '#fff' : '#000', pointerEvents: 'none' }}>
        <span style={{ fontSize: 15, fontWeight: 600, fontFamily: '-apple-system', letterSpacing: -0.2 }}>9:41</span>
        <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
          <svg width="17" height="11" viewBox="0 0 17 11" fill="currentColor"><rect x="0" y="6" width="3" height="4" rx="0.5"/><rect x="4.5" y="4" width="3" height="6" rx="0.5"/><rect x="9" y="2" width="3" height="8" rx="0.5"/><rect x="13.5" y="0" width="3" height="10" rx="0.5"/></svg>
          <svg width="22" height="11" viewBox="0 0 22 11" fill="none" stroke="currentColor" strokeWidth="1.2"><rect x="0.5" y="0.5" width="18" height="10" rx="2.5"/><rect x="2" y="2" width="14" height="7" rx="1" fill="currentColor"/><path d="M20.2 4v3c.5-.2.9-.7.9-1.5s-.4-1.3-.9-1.5z" fill="currentColor"/></svg>
        </div>
      </div>
      {children}
      <div style={{ position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)', width: 134, height: 5, borderRadius: 3, background: dark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.3)', zIndex: 100 }} />
    </div>
  );
}

function Desktop({ children, dark, w = 1280, h = 820 }) {
  const bg = dark ? '#0F0C09' : '#EFE7D7';
  return (
    <div style={{ width: w, height: h, background: bg, borderRadius: 14, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.18)', position: 'relative' }}>
      <div style={{ height: 34, background: dark ? '#221D18' : '#FFFDF7', borderBottom: `1px solid ${dark ? 'rgba(255,255,255,0.06)' : 'rgba(94,76,58,0.12)'}`, display: 'flex', alignItems: 'center', padding: '0 14px', gap: 7 }}>
        <div style={{ width: 12, height: 12, borderRadius: 6, background: '#FF5F56' }}/>
        <div style={{ width: 12, height: 12, borderRadius: 6, background: '#FFBD2E' }}/>
        <div style={{ width: 12, height: 12, borderRadius: 6, background: '#27C93F' }}/>
        <div style={{ flex: 1, textAlign: 'center', fontSize: 12, color: dark ? '#B8AA99' : '#6B5F54', fontWeight: 500 }}>acorn.app · Amélie's household</div>
      </div>
      <div style={{ height: h - 34 }}>{children}</div>
    </div>
  );
}

function App() {
  return (
    <DesignCanvas minScale={0.15} maxScale={2}>
      <div style={{ padding: '0 60px 40px', maxWidth: 720 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(60,50,40,0.7)', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10 }}>Design · v2 · Maple, refined</div>
        <div style={{ fontSize: 36, fontWeight: 600, color: 'rgba(40,30,20,0.9)', letterSpacing: -0.8, marginBottom: 12, lineHeight: 1.08 }}>
          Acorn — warm, Canadian, interactive
        </div>
        <div style={{ fontSize: 15, color: 'rgba(60,50,40,0.72)', lineHeight: 1.55 }}>
          Mobile (light + dark) plus desktop. Every screen is interactive — tap the ⤢ icon to focus.
          Try: balance count-up, eye to blur, chart scrub, card tap-to-flip, tx swipe-left, 4-step onboarding, budget row tap, shared expense sheet.
          Quartz and Obsidian explorations are preserved below for reference.
        </div>
      </div>

      <DCSection id="maple-mobile-light" title="Maple · Mobile · Light" subtitle="iPhone — cream surfaces, Instrument Serif headlines, forest accent. Tap cards to flip, chart to scrub, tx to swipe.">
        <DCArtboard id="ml1" label="Onboarding · 4-step" width={PHONE_W} height={PHONE_H}><Phone><MapleTheme><MOnboarding/></MapleTheme></Phone></DCArtboard>
        <DCArtboard id="ml2" label="Dashboard · count-up + scrub" width={PHONE_W} height={PHONE_H}><Phone><MapleTheme><MDashboard/></MapleTheme></Phone></DCArtboard>
        <DCArtboard id="ml3" label="Activity · swipe-reveal" width={PHONE_W} height={PHONE_H}><Phone><MapleTheme><MTransactions/></MapleTheme></Phone></DCArtboard>
        <DCArtboard id="ml4" label="Budgets · tap to expand" width={PHONE_W} height={PHONE_H}><Phone><MapleTheme><MBudgets/></MapleTheme></Phone></DCArtboard>
        <DCArtboard id="ml5" label="Investments · CRA room" width={PHONE_W} height={PHONE_H}><Phone><MapleTheme><MInvest/></MapleTheme></Phone></DCArtboard>
        <DCArtboard id="ml6" label="Shared · bottom sheet" width={PHONE_W} height={PHONE_H}><Phone><MapleTheme><MShared/></MapleTheme></Phone></DCArtboard>
      </DCSection>

      <DCSection id="maple-mobile-dark" title="Maple · Mobile · Dark" subtitle="Warm espresso dark mode — same type, same interactions, 4.5:1 contrast throughout.">
        <DCArtboard id="md1" label="Onboarding" width={PHONE_W} height={PHONE_H}><Phone dark><MapleTheme dark><MOnboarding/></MapleTheme></Phone></DCArtboard>
        <DCArtboard id="md2" label="Dashboard" width={PHONE_W} height={PHONE_H}><Phone dark><MapleTheme dark><MDashboard/></MapleTheme></Phone></DCArtboard>
        <DCArtboard id="md3" label="Activity" width={PHONE_W} height={PHONE_H}><Phone dark><MapleTheme dark><MTransactions/></MapleTheme></Phone></DCArtboard>
        <DCArtboard id="md4" label="Budgets" width={PHONE_W} height={PHONE_H}><Phone dark><MapleTheme dark><MBudgets/></MapleTheme></Phone></DCArtboard>
        <DCArtboard id="md5" label="Investments" width={PHONE_W} height={PHONE_H}><Phone dark><MapleTheme dark><MInvest/></MapleTheme></Phone></DCArtboard>
        <DCArtboard id="md6" label="Shared" width={PHONE_W} height={PHONE_H}><Phone dark><MapleTheme dark><MShared/></MapleTheme></Phone></DCArtboard>
      </DCSection>

      <DCSection id="maple-desktop" title="Maple · Desktop" subtitle="Responsive web shell with left sidebar. Same components, adaptive layout.">
        <DCArtboard id="dl1" label="Dashboard · Light" width={1280} height={820}><Desktop><MapleTheme><MDesktopDashboard/></MapleTheme></Desktop></DCArtboard>
        <DCArtboard id="dl2" label="Investments · Light" width={1280} height={820}><Desktop><MapleTheme><MDesktopInvest/></MapleTheme></Desktop></DCArtboard>
        <DCArtboard id="dd1" label="Dashboard · Dark" width={1280} height={820}><Desktop dark><MapleTheme dark><MDesktopDashboard/></MapleTheme></Desktop></DCArtboard>
        <DCArtboard id="dd2" label="Investments · Dark" width={1280} height={820}><Desktop dark><MapleTheme dark><MDesktopInvest/></MapleTheme></Desktop></DCArtboard>
      </DCSection>

      <DCSection id="quartz" title="01 · Quartz (reference)" subtitle="Minimal cool direction — kept for comparison.">
        <DCArtboard id="q2" label="Dashboard" width={PHONE_W} height={PHONE_H}><Phone><QDashboard/></Phone></DCArtboard>
        <DCArtboard id="q3" label="Transactions" width={PHONE_W} height={PHONE_H}><Phone><QTransactions/></Phone></DCArtboard>
        <DCArtboard id="q5" label="Investments" width={PHONE_W} height={PHONE_H}><Phone><QInvest/></Phone></DCArtboard>
      </DCSection>

      <DCSection id="obsidian" title="03 · Obsidian (reference)" subtitle="Data-dense dark direction — kept for comparison.">
        <DCArtboard id="o2" label="Dashboard" width={PHONE_W} height={PHONE_H}><Phone dark><ODashboard/></Phone></DCArtboard>
        <DCArtboard id="o3" label="Transactions" width={PHONE_W} height={PHONE_H}><Phone dark><OTransactions/></Phone></DCArtboard>
        <DCArtboard id="o5" label="Investments" width={PHONE_W} height={PHONE_H}><Phone dark><OInvest/></Phone></DCArtboard>
      </DCSection>

      <div style={{ padding: '20px 60px 80px', maxWidth: 720, color: 'rgba(60,50,40,0.65)', fontSize: 13, lineHeight: 1.6 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(60,50,40,0.8)', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 }}>What's interactive</div>
        • Onboarding — 4 steps with animated progress dots, back/continue<br/>
        • Dashboard — count-up balance, eye toggles privacy blur, scrub chart, tap account card to flip to card back, staggered stat reveal<br/>
        • Activity — chip filters (All/Shared/Amélie/Jordan), drag/swipe rows left to reveal Split + Delete<br/>
        • Budgets — ring animates in, tap a category to expand the 19-day spend trail<br/>
        • Investments — scrubable portfolio chart, animated donut, CRA room bars fill in<br/>
        • Shared — balance counts up, tap any shared expense for settlement bottom-sheet
        <div style={{ marginTop: 18, fontSize: 12, fontWeight: 600, color: 'rgba(60,50,40,0.8)', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 }}>Ready for handoff</div>
        When you're happy, I can port these into your Next.js app as Tailwind components that drop into <code>src/app/(app)/*</code> routes and reuse your Supabase server actions.
      </div>
    </DesignCanvas>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
