import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import {
  Bar, BarChart, Cell, CartesianGrid, Legend,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis
} from 'recharts';
import {
  AlertCircle, ArrowRight, CheckCircle2, Download, EyeOff,
  FileText, Fingerprint, KeyRound, LayoutDashboard, LogIn,
  LogOut, MessageCircle, Moon, QrCode, RefreshCcw, Send,
  ShieldCheck, Sun, Upload, UserPlus, Zap
} from 'lucide-react';

const API_BASE = 'https://reviewmind-production.up.railway.app';

const STORAGE_KEYS = {
  token: 'reviewmind_token',
  email: 'reviewmind_email',
  plan:  'reviewmind_plan',
  theme: 'reviewmind_theme',
};

const PLANS = {
  basic: {
    key: 'basic', name: 'Basic Free', price: '$0', accent: '#64748b',
    features: { analysis: true, timeSeries: true, blockchain: false, chat: false, report: false, debug: false },
  },
  business: {
    key: 'business', name: 'Small Business', price: '$150', accent: '#2563eb',
    features: { analysis: true, timeSeries: true, blockchain: true, chat: true, report: true, debug: false },
  },
  enterprise: {
    key: 'enterprise', name: 'Enterprise', price: '$200', accent: '#7c3aed',
    features: { analysis: true, timeSeries: true, blockchain: true, chat: true, report: true, debug: true },
  },
};

const PLAN_ORDER = ['basic', 'business', 'enterprise'];

const SENTIMENT_COLORS = { Positive: '#059669', Negative: '#dc2626', Neutral: '#d97706' };

const emptyAnalysis = {
  pieData: [], metrics: { total_reviews: 0, avg_rating: 0, detected_col: '', risk_level: '' },
  complaintCategories: [], ratingDistribution: [], analysisMetadata: null, blockchainVerification: null,
};

const defaultProgress = [
  { key: 'upload',     label: 'CSV uploaded',            status: 'idle' },
  { key: 'parse',      label: 'CSV parsed',               status: 'idle' },
  { key: 'python',     label: 'Python analysis',          status: 'idle' },
  { key: 'blockchain', label: 'Blockchain verification',   status: 'idle' },
  { key: 'dashboard',  label: 'Dashboard ready',          status: 'idle' },
];

// ─── helpers ─────────────────────────────────────────────────────
const fmt = (v) => { const n = Number(v); return Number.isFinite(n) ? n.toLocaleString() : '0'; };
const readLocal = (k, def = null) => { try { return localStorage.getItem(k) ?? def; } catch { return def; } };
const writeLocal = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
const removeLocal = (k) => { try { localStorage.removeItem(k); } catch {} };

const readSession = () => {
  const token = readLocal(STORAGE_KEYS.token);
  if (!token) return null;
  return {
    token,
    email: readLocal(STORAGE_KEYS.email, ''),
    plan:  PLANS[readLocal(STORAGE_KEYS.plan)] ? readLocal(STORAGE_KEYS.plan) : 'basic',
  };
};

const saveSession = (s) => {
  if (s?.token) {
    writeLocal(STORAGE_KEYS.token, s.token);
    writeLocal(STORAGE_KEYS.email, s.email || '');
    writeLocal(STORAGE_KEYS.plan,  s.plan  || 'basic');
  } else {
    removeLocal(STORAGE_KEYS.token);
    removeLocal(STORAGE_KEYS.email);
    removeLocal(STORAGE_KEYS.plan);
  }
};

// ─── small components ─────────────────────────────────────────────
const Badge = ({ tone = 'neutral', children }) => <span className={`badge badge--${tone}`}>{children}</span>;

const StatCard = ({ icon: Icon, label, value, caption, accent = '#2563eb' }) => (
  <div className="stat-card" style={{ '--accent': accent }}>
    <div className="stat-card__icon"><Icon size={20} /></div>
    <div className="stat-card__body">
      <div className="stat-card__label">{label}</div>
      <div className="stat-card__value">{value}</div>
      {caption && <div className="stat-card__caption">{caption}</div>}
    </div>
  </div>
);

const Panel = ({ title, subtitle, action, children, className = '' }) => (
  <section className={`panel ${className}`.trim()}>
    <div className="panel__header">
      <div><h3>{title}</h3>{subtitle && <p>{subtitle}</p>}</div>
      {action}
    </div>
    {children}
  </section>
);

const Empty = ({ title, description }) => (
  <div className="empty-state"><strong>{title}</strong><p>{description}</p></div>
);

// ─── Auth Tabs ───────────────────────────────────────────────────
const AuthTabs = ({ view, onChange }) => (
  <div className="auth-tabs">
    {[
      { key: 'login',  label: 'Sign in',        icon: LogIn    },
      { key: 'signup', label: 'Create account',  icon: UserPlus },
      { key: 'forgot', label: 'Forgot password', icon: EyeOff   },
      { key: 'mfa',    label: 'MFA verify',      icon: KeyRound },
    ].map(({ key, label, icon: Icon }) => (
      <button key={key} type="button"
        className={view === key ? 'auth-tab auth-tab--active' : 'auth-tab'}
        onClick={() => onChange(key)}>
        <Icon size={16} />{label}
      </button>
    ))}
  </div>
);

// ─── Chat Drawer ─────────────────────────────────────────────────
const ChatDrawer = ({ analysis, sessionId, onClose }) => {
  const [convId, setConvId]     = useState('');
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Ask me about your review data — sentiment, complaints, risks, or next actions.' }
  ]);
  const [msg, setMsg]   = useState('');
  const [busy, setBusy] = useState(false);
  const endRef          = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  useEffect(() => {
    if (!analysis?.pieData?.length) return;
    axios.post(`${API_BASE}/api/advanced/chat/conversation`, {
      sessionId,
      analysisContext: {
        sentimentData:  analysis.pieData          || [],
        complaints:     analysis.complaintCategories || [],
        metrics:        analysis.metrics          || {},
        filename:       analysis.analysisMetadata?.filename || 'uploaded CSV',
      },
    })
      .then(r => { if (r.data.conversationId) setConvId(r.data.conversationId); })
      .catch(() => setMessages(p => [...p, { role: 'assistant', content: 'Chat service unavailable right now.' }]));
  }, [analysis, sessionId]);

  const send = async () => {
    const t = msg.trim();
    if (!t || !convId || busy) return;
    setMsg('');
    setMessages(p => [...p, { role: 'user', content: t }]);
    setBusy(true);
    try {
      const r = await axios.post(`${API_BASE}/api/advanced/chat/message`, { conversationId: convId, message: t });
      const reply = r.data.assistantResponse || r.data.reply || 'No response received.';
      setMessages(p => [...p, { role: 'assistant', content: reply }]);
    } catch {
      setMessages(p => [...p, { role: 'assistant', content: 'Could not reach the assistant. Try again.' }]);
    } finally { setBusy(false); }
  };

  return (
    <div className="chat-drawer">
      <div className="chat-drawer__header">
        <div><div className="chat-drawer__eyebrow">ReviewMind AI</div><h3>Strategy Assistant</h3></div>
        <button className="icon-button" onClick={onClose}><ArrowRight size={18} /></button>
      </div>
      <div className="chat-drawer__messages">
        {messages.map((m, i) => (
          <div key={i} className={`chat-bubble chat-bubble--${m.role}`}>{m.content}</div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="chat-drawer__composer">
        <input value={msg} onChange={e => setMsg(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
          placeholder="Ask about the review data..." disabled={busy || !convId} />
        <button className="primary-button" onClick={send} disabled={busy || !convId}>
          <Send size={16} />Send
        </button>
      </div>
    </div>
  );
};

// ─── Blockchain Panel ────────────────────────────────────────────
const BlockchainPanel = () => {
  const [stats, setStats]   = useState(null);
  const [loading, setLoad]  = useState(false);
  const load = async () => {
    setLoad(true);
    try { const r = await axios.get(`${API_BASE}/api/advanced/blockchain/stats`); setStats(r.data.statistics || null); }
    catch { setStats(null); }
    finally { setLoad(false); }
  };
  useEffect(() => { load(); }, []);
  return (
    <div className="stack">
      <div className="grid grid--3">
        <StatCard icon={Fingerprint}  label="Verified Reviews" value={fmt(stats?.totalReviews || 0)} accent="#0f766e" />
        <StatCard icon={ShieldCheck}  label="Blocks"           value={fmt(stats?.totalBlocks  || 0)} accent="#2563eb" />
        <StatCard icon={CheckCircle2} label="Chain State"
          value={stats?.chainValid ? 'VALID' : 'PENDING'}
          accent={stats?.chainValid ? '#059669' : '#d97706'}
          caption={stats?.chainValid ? 'Integrity verified' : 'Waiting'} />
      </div>
      <Panel title="Ledger Integrity"
        subtitle="Every review can be verified — tampering is detectable through the chain hash."
        action={<button className="ghost-button" onClick={load} disabled={loading}><RefreshCcw size={16} />Refresh</button>}>
        <div className="integrity-card">
          <div className="integrity-card__icon"><ShieldCheck size={20} /></div>
          <div><strong>Blockchain verification is enabled.</strong>
            <p>Confirm the ledger state before sharing reports with stakeholders.</p></div>
        </div>
      </Panel>
    </div>
  );
};

// ─── Insights generator ───────────────────────────────────────────
const genInsights = (analysis) => {
  if (!analysis?.pieData?.length) return null;
  const tot = analysis.pieData.reduce((s, d) => s + (d.value || 0), 0);
  if (!tot) return null;
  const pos     = analysis.pieData.find(d => d.name === 'Positive')?.value || 0;
  const neg     = analysis.pieData.find(d => d.name === 'Negative')?.value || 0;
  const neu     = analysis.pieData.find(d => d.name === 'Neutral')?.value  || 0;
  const posPct  = Math.round(pos / tot * 100);
  const negPct  = Math.round(neg / tot * 100);
  const avg     = analysis.metrics?.avg_rating || 0;
  const out     = [];
  if (negPct >= 30) out.push({ title: 'Address negative sentiment', description: `${negPct}% negative. Focus on top complaint categories immediately.` });
  if (posPct >= 60) out.push({ title: 'Capitalize on positive momentum', description: `${posPct}% of customers are satisfied. Leverage these for marketing.` });
  if (avg < 3)      out.push({ title: 'Rating requires attention',   description: `Average ${avg.toFixed(1)}/5 — investigate root causes.` });
  else if (avg >= 4) out.push({ title: 'Strong customer satisfaction', description: `Average ${avg.toFixed(1)}/5 — use this data to guide product decisions.` });
  if (neu > 20)     out.push({ title: 'Engage neutral reviewers',    description: `${Math.round(neu/tot*100)}% neutral — convert them with targeted improvements.` });
  return out.length ? out : null;
};

// ═══════════════════════════════════════════════════════════════════
//  MAIN APP
// ═══════════════════════════════════════════════════════════════════
export default function App() {
  const [session, setSession]         = useState(readSession);
  const [plan, setPlan]               = useState(() => readSession()?.plan || 'basic');
  const [authView, setAuthView]       = useState('login');
  const [authForm, setAuthForm]       = useState({ email: '', password: '', token: '', newPassword: '', confirmPassword: '', mfaCode: '' });
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError]     = useState('');
  const [authNotice, setAuthNotice]   = useState('Sign in to unlock the workspace.');
  const [signupQr, setSignupQr]       = useState('');
  const [resetLink, setResetLink]     = useState('');
  const [pendingEmail, setPending]    = useState('');
  const [signupPlan, setSignupPlan]   = useState('basic');
  const [partialToken, setPartialToken] = useState('');
  const [mfaQrCode, setMfaQrCode]     = useState('');
  const [mfaSecret, setMfaSecret]     = useState('');

  const [file, setFile]               = useState(null);
  const [sessionId, setSessionId]     = useState('');
  const [analysis, setAnalysis]       = useState(emptyAnalysis);
  const [progress, setProgress]       = useState(defaultProgress);
  const [loading, setLoading]         = useState(false);
  const [status, setStatus]           = useState('idle');
  const [error, setError]             = useState('');
  const [tab, setTab]                 = useState('overview');
  const [chatOpen, setChatOpen]       = useState(false);
  const [reportStatus, setRptStatus]  = useState('No report generated yet.');
  const [reportBusy, setRptBusy]      = useState(false);
  const [theme, setTheme]             = useState(() => readLocal(STORAGE_KEYS.theme, 'light'));

  const activePlan   = PLANS[plan] || PLANS.basic;
  const can          = (f) => Boolean(activePlan.features?.[f]);
  const nextPlanKey  = PLAN_ORDER[Math.min(PLAN_ORDER.indexOf(plan) + 1, PLAN_ORDER.length - 1)];
  const hasAnalysis  = (analysis?.pieData || []).length > 0 && analysis.pieData.some(d => d.value > 0);

  const total    = useMemo(() => analysis.pieData.reduce((s, d) => s + (Number(d.value) || 0), 0), [analysis]);
  const positive = useMemo(() => analysis.pieData.find(d => d.name === 'Positive')?.value || 0, [analysis]);
  const negative = useMemo(() => analysis.pieData.find(d => d.name === 'Negative')?.value || 0, [analysis]);
  const neutral  = useMemo(() => analysis.pieData.find(d => d.name === 'Neutral')?.value  || 0, [analysis]);
  const chartData= useMemo(() => analysis.pieData.map(d => ({ ...d, value: Number(d.value)||0, fill: SENTIMENT_COLORS[d.name] || '#2563eb' })), [analysis]);

  useEffect(() => {
    writeLocal(STORAGE_KEYS.theme, theme);
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    if (session?.token) axios.defaults.headers.common.Authorization = `Bearer ${session.token}`;
    else delete axios.defaults.headers.common.Authorization;
  }, [session]);

  useEffect(() => {
    if (!session?.token) return;
    axios.get(`${API_BASE}/api/user/subscription`)
      .then(r => {
        const sp = PLANS[r.data?.subscriptionPlan] ? r.data.subscriptionPlan : 'basic';
        setPlan(sp);
        setSession(s => { const n = { ...s, plan: sp }; saveSession(n); return n; });
      })
      .catch(e => {
        if (e.response?.status === 401 || e.response?.status === 403) {
          saveSession(null); setSession(null); setPlan('basic');
          setAuthView('login'); setAuthNotice('Session expired. Sign in again.');
        }
      });
  }, [session?.token]);

  // ── Auth submit (Register, Login, MFA) ───────────────────────────
  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthError(''); setAuthNotice(''); setAuthLoading(true);
    try {
      // REGISTER
      if (authView === 'signup') {
        const r = await axios.post(`${API_BASE}/api/auth/register`, {
          email: authForm.email, password: authForm.password, subscriptionPlan: signupPlan,
        });
        const token = r.data.token;
        // After registration, automatically setup MFA
        if (token) {
          const mfaRes = await axios.post(`${API_BASE}/api/auth/setup-mfa`, {}, {
            headers: { Authorization: `Bearer ${token}` }
          });
          setMfaQrCode(mfaRes.data.qrCode);
          setMfaSecret(mfaRes.data.secret);
          setAuthNotice('Account created! Scan QR code below with Google Authenticator, then enter the code to enable MFA.');
          setAuthView('mfa-setup');
          setSession({ token, email: authForm.email, plan: signupPlan });
          saveSession({ token, email: authForm.email, plan: signupPlan });
          return;
        }
      }

      // ENABLE MFA (after QR scan)
      if (authView === 'mfa-setup') {
        const token = session?.token;
        if (!token) throw new Error('No token found');
        const r = await axios.post(`${API_BASE}/api/auth/enable-mfa`, { code: authForm.mfaCode }, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (r.data.success) {
          setAuthNotice('MFA enabled successfully! You can now login with MFA.');
          setAuthView('login');
          setMfaQrCode('');
          setMfaSecret('');
        }
        return;
      }

      // FORGOT PASSWORD
      if (authView === 'forgot') {
        const r = await axios.post(`${API_BASE}/api/auth/forgot-password`, { email: authForm.email });
        setResetLink(r.data.resetLink || '');
        setAuthForm(p => ({ ...p, token: r.data.resetToken || '' }));
        setAuthNotice('Reset token generated. Use it to set a new password.');
        setAuthView('reset');
        return;
      }

      // RESET PASSWORD
      if (authView === 'reset') {
        if (authForm.newPassword !== authForm.confirmPassword) { setAuthError('Passwords do not match.'); return; }
        await axios.post(`${API_BASE}/api/auth/reset-password`, { token: authForm.token, password: authForm.newPassword });
        setAuthNotice('Password reset. Sign in with your new password.');
        setAuthView('login');
        return;
      }

      // LOGIN — returns token or partialToken for MFA
      if (authView === 'login') {
        const r = await axios.post(`${API_BASE}/api/auth/login`, {
          email: authForm.email, password: authForm.password,
        });

        if (r.data?.mfaRequired) {
          setPartialToken(r.data.partialToken);
          setPending(r.data.email || authForm.email);
          setAuthNotice('Enter your 6-digit MFA code from Google Authenticator.');
          setAuthView('mfa-verify');
        } else if (r.data?.token) {
          const ns = { token: r.data.token, email: authForm.email, plan: r.data.subscriptionPlan || 'basic' };
          saveSession(ns); setSession(ns); setPlan(ns.plan);
          setAuthNotice('');
          setTab('overview');
        }
        return;
      }

      // VERIFY MFA CODE
      if (authView === 'mfa-verify') {
        const r = await axios.post(`${API_BASE}/api/auth/verify-mfa`, {
          partialToken: partialToken,
          code: authForm.mfaCode
        });
        if (r.data.token) {
          const ns = { token: r.data.token, email: pendingEmail, plan: 'basic' };
          saveSession(ns); setSession(ns); setPlan(ns.plan);
          setAuthNotice('');
          setTab('overview');
        }
        return;
      }

    } catch (err) {
      setAuthError(err.response?.data?.error || err.response?.data?.message || err.message || 'Authentication failed.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    saveSession(null); setSession(null); setPlan('basic');
    setAuthView('login');
    setAuthForm({ email: '', password: '', token: '', newPassword: '', confirmPassword: '', mfaCode: '' });
    setAnalysis(emptyAnalysis); setProgress(defaultProgress);
    setFile(null); setSessionId(''); setStatus('idle'); setError('');
    setChatOpen(false); setRptStatus('No report generated yet.');
    setMfaQrCode(''); setMfaSecret(''); setPartialToken('');
  };

  // ── Upgrade plan ─────────────────────────────────────────────────
  const handleUpgrade = async (planKey) => {
    try {
      const r = await axios.patch(`${API_BASE}/api/user/subscription`, { plan: planKey, subscriptionPlan: planKey });
      const up = r.data.subscriptionPlan || planKey;
      setPlan(up);
      setSession(s => { const n = { ...s, plan: up, token: r.data.token || s.token }; saveSession(n); return n; });
      setRptStatus(`Upgraded to ${PLANS[up]?.name || up}.`);
    } catch (err) {
      setError(err.response?.data?.error || 'Upgrade failed.');
    }
  };

  // ── Upload & Analyze ──────────────────────────────────────────────
  const uploadAndAnalyze = async () => {
    if (!file) { setError('Select a CSV file first.'); return; }
    setError(''); setLoading(true); setStatus('uploading');
    setProgress([
      { key: 'upload',     label: 'CSV uploaded',           status: 'running' },
      { key: 'parse',      label: 'CSV parsed',              status: 'idle' },
      { key: 'python',     label: 'Python analysis',         status: 'idle' },
      { key: 'blockchain', label: 'Blockchain verification',  status: 'idle' },
      { key: 'dashboard',  label: 'Dashboard ready',         status: 'idle' },
    ]);

    try {
      const form = new FormData();
      form.append('file', file);
      const res  = await axios.post(`${API_BASE}/api/advanced/ml/upload-analyze`, form);
      const d    = res.data.data || res.data;
      if (res.data.sessionId) setSessionId(res.data.sessionId);
      if (!d?.pieData) throw new Error('No pieData in response');

      setAnalysis({
        pieData:             d.pieData             || [],
        metrics:             d.metrics             || {},
        complaintCategories: d.complaintCategories || [],
        ratingDistribution:  d.ratingDistribution  || [],
        analysisMetadata:    d.analysisMetadata    || { totalReviewsAnalyzed: d.metrics?.total_reviews || 0, analysisTime: new Date().toISOString(), pythonServiceStatus: 'Connected' },
        blockchainVerification: res.data.blockchainVerification || null,
      });

      setProgress([
        { key: 'upload',     label: 'CSV uploaded',           status: 'done'    },
        { key: 'parse',      label: 'CSV parsed',              status: 'done'    },
        { key: 'python',     label: 'Python analysis',         status: 'done'    },
        { key: 'blockchain', label: 'Blockchain verification',  status: 'pending' },
        { key: 'dashboard',  label: 'Dashboard ready',         status: 'done'    },
      ]);
      setStatus('ready');
      setTab('overview');
      setRptStatus(`Analysis complete! ${d.metrics?.total_reviews || 0} reviews analyzed.`);
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Analysis failed.';
      setError(msg); setStatus('error');
      setProgress([
        { key: 'upload',     label: 'CSV uploaded',           status: 'done'  },
        { key: 'parse',      label: 'CSV parsed',              status: 'done'  },
        { key: 'python',     label: 'Python analysis',         status: 'error' },
        { key: 'blockchain', label: 'Blockchain verification',  status: 'idle'  },
        { key: 'dashboard',  label: 'Dashboard ready',         status: 'idle'  },
      ]);
    } finally { setLoading(false); }
  };

  // ── Generate PDF ─────────────────────────────────────────────────
  const generateReport = async () => {
    if (!hasAnalysis)  { setError('Run analysis first.'); return; }
    if (!can('report')){ setError('PDF export requires Small Business or Enterprise plan.'); return; }
    try {
      setRptBusy(true); setRptStatus('Generating PDF...');
      const res = await axios.post(`${API_BASE}/api/advanced/reports/generate`, {
        sessionId,
        analysisData: {
          pieData: analysis.pieData, metrics: analysis.metrics,
          complaintCategories: analysis.complaintCategories, ratingDistribution: analysis.ratingDistribution,
        },
      });
      const rpt = res.data.report;
      const url = rpt?.reportId
        ? `${API_BASE}/api/advanced/reports/download/${rpt.reportId}`
        : `${API_BASE}${rpt?.url || ''}`;
      const a = document.createElement('a');
      a.href = url; a.download = rpt?.filename || 'reviewmind-report.pdf';
      document.body.appendChild(a); a.click(); setTimeout(() => a.remove(), 100);
      setRptStatus(`Report ready: ${rpt?.filename || 'reviewmind-report.pdf'}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Report generation failed.');
      setRptStatus('Report generation failed.');
    } finally { setRptBusy(false); }
  };

  // ─── AUTH SCREEN (Login/Register/MFA) ────────────────────────────
  if (!session?.token && authView !== 'mfa-setup') {
    return (
      <div className="auth-shell">
        <div className="ambient ambient--one" /><div className="ambient ambient--two" />
        <div className="auth-grid">
          <section className="auth-hero">
            <Badge tone="brand">ReviewMind Secure Access</Badge>
            <h1>Sign in to the review intelligence workspace.</h1>
            <p>ReviewMind is built as a secure product flow: authenticate first, then upload data, verify the ledger, chat with the assistant, and export a board-ready report.</p>
            <div className="purpose-strip">
              <div className="purpose-card"><strong>1. Ingest</strong><span>Upload CSV review data and run analysis.</span></div>
              <div className="purpose-card"><strong>2. Verify</strong><span>Confirm blockchain integrity before sharing results.</span></div>
              <div className="purpose-card"><strong>3. Export</strong><span>Generate PDF reports and use the chat assistant.</span></div>
            </div>
          </section>

          <section className="auth-card">
            {authView !== 'mfa-setup' && <AuthTabs view={authView} onChange={setAuthView} />}

            {authNotice && <div className="notice notice--info"><CheckCircle2 size={16} /><span>{authNotice}</span></div>}
            {authError  && <div className="notice notice--error"><AlertCircle size={16} /><span>{authError}</span></div>}

            {/* MFA Setup QR Code */}
            {authView === 'mfa-setup' && mfaQrCode && (
              <div className="qr-card">
                <div className="qr-card__header"><QrCode size={16} /><strong>Scan QR Code with Google Authenticator</strong></div>
                <img src={mfaQrCode} alt="MFA QR" style={{ width: 200, height: 200, margin: '10px auto' }} />
                <p>Secret: <strong>{mfaSecret}</strong></p>
                <p>Enter the 6-digit code from your authenticator app below:</p>
                <input type="text" maxLength={6} placeholder="123456"
                  value={authForm.mfaCode} onChange={e => setAuthForm(p => ({ ...p, mfaCode: e.target.value }))} />
                <button className="primary-button" style={{ marginTop: 10 }} onClick={handleAuth}>Enable MFA</button>
              </div>
            )}

            <form className="auth-form" onSubmit={handleAuth}>
              {authView === 'mfa-verify' ? (
                <>
                  <div className="field field--readonly"><span>Account</span><strong>{pendingEmail}</strong></div>
                  <label className="field"><span>MFA code</span>
                    <input type="text" inputMode="numeric" maxLength={6} placeholder="123456" required
                      value={authForm.mfaCode} onChange={e => setAuthForm(p => ({ ...p, mfaCode: e.target.value }))} />
                  </label>
                </>
              ) : authView === 'reset' ? (
                <>
                  <label className="field"><span>Reset token</span>
                    <input type="text" placeholder="Paste token" required
                      value={authForm.token} onChange={e => setAuthForm(p => ({ ...p, token: e.target.value }))} />
                  </label>
                  <label className="field"><span>New password</span>
                    <input type="password" placeholder="New password" required
                      value={authForm.newPassword} onChange={e => setAuthForm(p => ({ ...p, newPassword: e.target.value }))} />
                  </label>
                  <label className="field"><span>Confirm password</span>
                    <input type="password" placeholder="Repeat password" required
                      value={authForm.confirmPassword} onChange={e => setAuthForm(p => ({ ...p, confirmPassword: e.target.value }))} />
                  </label>
                </>
              ) : authView === 'forgot' ? (
                <label className="field"><span>Email</span>
                  <input type="email" placeholder="you@company.com" required
                    value={authForm.email} onChange={e => setAuthForm(p => ({ ...p, email: e.target.value }))} />
                </label>
              ) : authView === 'signup' ? (
                <>
                  <label className="field"><span>Email</span>
                    <input type="email" autoComplete="email" placeholder="you@company.com" required
                      value={authForm.email} onChange={e => setAuthForm(p => ({ ...p, email: e.target.value }))} />
                  </label>
                  <label className="field"><span>Password</span>
                    <input type="password" autoComplete="new-password" placeholder="Enter your password" required
                      value={authForm.password} onChange={e => setAuthForm(p => ({ ...p, password: e.target.value }))} />
                  </label>
                  <div className="field"><span>Plan</span>
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      {PLAN_ORDER.map(pk => (
                        <button key={pk} type="button" onClick={() => setSignupPlan(pk)}
                          style={{ flex: 1, padding: '10px 8px', borderRadius: 8, cursor: 'pointer',
                            border: signupPlan === pk ? `2px solid ${PLANS[pk].accent}` : '1px solid var(--border)',
                            fontWeight: signupPlan === pk ? 700 : 500, fontSize: 13 }}>
                          {PLANS[pk].name}<br /><small>{PLANS[pk].price}</small>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              ) : authView === 'login' ? (
                <>
                  <label className="field"><span>Email</span>
                    <input type="email" autoComplete="email" placeholder="you@company.com" required
                      value={authForm.email} onChange={e => setAuthForm(p => ({ ...p, email: e.target.value }))} />
                  </label>
                  <label className="field"><span>Password</span>
                    <input type="password" autoComplete="current-password" placeholder="Enter your password" required
                      value={authForm.password} onChange={e => setAuthForm(p => ({ ...p, password: e.target.value }))} />
                  </label>
                </>
              ) : null}

              {authView !== 'mfa-setup' && authView !== 'mfa-verify' && (
                <button className="primary-button auth-submit" type="submit" disabled={authLoading}>
                  {authLoading ? <RefreshCcw size={16} className="spin" /> : <LogIn size={16} />}
                  {authLoading ? 'Working...' : authView === 'signup' ? 'Create account' : authView === 'forgot' ? 'Send reset link' : authView === 'reset' ? 'Reset password' : 'Sign in'}
                </button>
              )}
            </form>

            {authView !== 'mfa-setup' && authView !== 'mfa-verify' && (
              <div className="auth-footer-actions">
                {authView === 'login'  && <button type="button" className="ghost-button" onClick={() => setAuthView('forgot')}>Forgot password?</button>}
                {authView === 'login'  && <button type="button" className="ghost-button" onClick={() => setAuthView('signup')}>Create account</button>}
                {authView === 'signup' && <button type="button" className="ghost-button" onClick={() => setAuthView('login')}>Already have an account?</button>}
                {(authView === 'forgot' || authView === 'reset') && <button type="button" className="ghost-button" onClick={() => setAuthView('login')}>Back to sign in</button>}
              </div>
            )}
          </section>
        </div>
      </div>
    );
  }

  // ── Dashboard (Logged In) ─────────────────────────────────────────
  const navTabs = [
    { key: 'overview',    label: 'Overview',    icon: LayoutDashboard },
    { key: 'reports',     label: 'Reports',     icon: FileText        },
    { key: 'blockchain',  label: 'Blockchain',  icon: ShieldCheck     },
    { key: 'chat',        label: 'Chat',        icon: MessageCircle   },
  ];

  return (
    <div className="app-shell">
      <div className="ambient ambient--one" /><div className="ambient ambient--two" />

      <header className="hero hero--dashboard">
        <div className="hero__copy">
          <Badge tone="brand">Authenticated workspace</Badge>
          <h1>ReviewMind production dashboard.</h1>
          <p>Upload review data, analyze sentiment, verify the chain, chat with the assistant, and export clean reports.</p>
        </div>
        <div className="hero__actions hero__actions--stacked">
          <div className="session-chip"><strong>{session.email}</strong><span>Signed in</span></div>
          <div className="subscription-chip"><strong>{activePlan.name}</strong><span>{activePlan.price} plan</span></div>
          <button className="secondary-button" onClick={() => can('chat') ? setChatOpen(true) : setError('Chat requires Small Business or Enterprise plan.')}><MessageCircle size={16} />Open Chat</button>
          <button className="primary-button" onClick={generateReport} disabled={reportBusy}>
            {reportBusy ? <RefreshCcw size={16} className="spin" /> : <Download size={16} />}
            {reportBusy ? 'Generating...' : 'PDF Report'}
          </button>
          <button className="ghost-button" onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')}>
            {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
          </button>
          <button className="ghost-button" onClick={handleLogout}><LogOut size={16} />Sign out</button>
        </div>
      </header>

      <main className="layout">
        <section className="upload-card">
          <div className="upload-card__header">
            <div><h2>Upload data</h2><p>CSV with a rating-like column such as rating, score, stars, or points.</p></div>
            <Badge tone={status === 'ready' ? 'success' : status === 'error' ? 'danger' : 'neutral'}>
              {status === 'ready' ? 'Ready' : status === 'error' ? 'Needs attention' : 'Idle'}
            </Badge>
          </div>
          <label className="dropzone" htmlFor="rm-file">
            <input id="rm-file" type="file" accept=".csv" onChange={e => setFile(e.target.files?.[0] || null)} />
            <Upload size={30} />
            <strong>{file ? file.name : 'Drop your CSV here or browse'}</strong>
            <span>Run analysis, blockchain verification, and report generation from one flow.</span>
          </label>
          {error && <div className="error-box"><AlertCircle size={16} /><span>{error}</span></div>}
          <div className="upload-card__actions">
            <button className="primary-button" onClick={uploadAndAnalyze} disabled={loading}>
              {loading ? <RefreshCcw size={16} className="spin" /> : <Zap size={16} />}
              {loading ? 'Analyzing...' : 'Analyze reviews'}
            </button>
            <button className="ghost-button" onClick={() => can('blockchain') ? setTab('blockchain') : setError('Blockchain requires Small Business or Enterprise plan.')}>
              <Fingerprint size={16} />Verify ledger
            </button>
          </div>
        </section>

        <section className="workspace">
          <div className="workspace__purpose">
            <div><h2>Why this page exists</h2>
              <p>This workspace turns raw review data into sentiment analysis, trust verification, report exports, and assistant-driven follow-up.</p>
            </div>
            <div className="workspace__meta">
              <Badge tone={hasAnalysis ? 'success' : 'neutral'}>{hasAnalysis ? 'Analysis loaded' : 'Awaiting data'}</Badge>
              <span>{reportStatus}</span>
            </div>
          </div>

          <Panel title="Subscription" subtitle="Your current plan and available upgrades." action={<Badge tone="brand">Current: {activePlan.name}</Badge>}>
            <div className="metric-list metric-list--loose">
              <div className="metric-row"><span>Plan</span><strong>{activePlan.name} {activePlan.price}</strong></div>
              <div className="metric-row"><span>Features</span><strong>{Object.values(activePlan.features).filter(Boolean).length} of 6 unlocked</strong></div>
            </div>
            {plan !== 'enterprise' ? (
              <div style={{ marginTop: 16, padding: 16, background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)' }}>
                <strong>Next tier: {PLANS[nextPlanKey].name}</strong>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>Unlock PDF reports, chat assistant, and blockchain verification.</p>
                <button className="primary-button" style={{ marginTop: 12 }} onClick={() => handleUpgrade(nextPlanKey)}>Upgrade to {PLANS[nextPlanKey].name}</button>
              </div>
            ) : (
              <div style={{ marginTop: 16, padding: 16, background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)' }}>
                <strong>You have the Enterprise tier!</strong>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>All features are unlocked.</p>
              </div>
            )}
          </Panel>

          <Panel title="Backend progress" subtitle="What the server has already completed for this run.">
            <div className="pipeline-list">
              {progress.map(s => (
                <div key={s.key} className={`pipeline-step pipeline-step--${s.status}`}>
                  <span className="pipeline-step__dot" />
                  <div><strong>{s.label}</strong>
                    <p>{s.status === 'done' ? 'Completed' : s.status === 'error' ? 'Failed' : s.status === 'running' ? 'In progress' : 'Waiting'}</p>
                  </div>
                </div>
              ))}
            </div>
            {analysis.analysisMetadata && (
              <div className="metric-list metric-list--loose" style={{ marginTop: 16 }}>
                <div className="metric-row"><span>Total reviews analyzed</span><strong>{analysis.analysisMetadata.totalReviewsAnalyzed || total}</strong></div>
                <div className="metric-row"><span>Python service</span><strong>{analysis.analysisMetadata.pythonServiceStatus || 'Unknown'}</strong></div>
                <div className="metric-row"><span>Blockchain status</span><strong>{analysis.blockchainVerification?.success ? 'Verified' : 'Unknown'}</strong></div>
                <div className="metric-row"><span>Analysis time</span><strong>{analysis.analysisMetadata.analysisTime || 'Unknown'}</strong></div>
              </div>
            )}
          </Panel>

          <div className="tabs">
            {navTabs.map(t => (
              <button key={t.key} className={tab === t.key ? 'tab tab--active' : 'tab'} onClick={() => setTab(t.key)}>
                <t.icon size={15} />{t.label}
              </button>
            ))}
          </div>

          {tab === 'overview' && (
            <div className="stack stack--xl">
              <div className="grid grid--4">
                <StatCard icon={FileText}    label="Total reviews" value={fmt(total)}    accent="#2563eb" caption="From uploaded data" />
                <StatCard icon={CheckCircle2} label="Positive"     value={fmt(positive)} accent="#059669" caption="Good experiences" />
                <StatCard icon={AlertCircle}  label="Negative"     value={fmt(negative)} accent="#dc2626" caption="Needs action" />
                <StatCard icon={ShieldCheck}  label="Neutral"      value={fmt(neutral)}  accent="#d97706" caption="Potential follow-up" />
              </div>

              <div className="grid grid--2">
                <Panel title="Sentiment split" subtitle="Auto-clustered from the uploaded dataset.">
                  {hasAnalysis ? (
                    <>
                      <ResponsiveContainer width="100%" height={280}>
                        <PieChart>
                          <Pie data={analysis.pieData} dataKey="value" nameKey="name" outerRadius={100} innerRadius={55} paddingAngle={4}>
                            {analysis.pieData.map(e => <Cell key={e.name} fill={SENTIMENT_COLORS[e.name] || '#2563eb'} />)}
                          </Pie>
                          <Tooltip /><Legend />
                        </PieChart>
                      </ResponsiveContainer>
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={chartData} layout="vertical" margin={{ left: 16, right: 16, top: 8, bottom: 8 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,.2)" />
                          <XAxis type="number" tick={{ fill: '#64748b', fontSize: 12 }} allowDecimals={false} />
                          <YAxis type="category" dataKey="name" tick={{ fill: '#64748b', fontSize: 12 }} width={80} />
                          <Tooltip contentStyle={{ background: 'var(--surface-strong)', border: '1px solid var(--border)', borderRadius: 12 }} />
                          <Bar dataKey="value" radius={[0, 12, 12, 0]}>
                            {chartData.map(e => <Cell key={e.name} fill={e.fill} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </>
                  ) : <Empty title="No sentiment data yet" description="Upload a CSV to generate the sentiment split and trend charts." />}
                </Panel>

                <Panel title="Live metrics" subtitle="Rendered directly from the Python analysis response."
                  action={<button className="ghost-button" onClick={generateReport} disabled={!hasAnalysis || reportBusy || !can('report')}><Download size={16} />Download</button>}>
                  {hasAnalysis ? (
                    <div className="metric-list">
                      <div className="metric-row"><span>Detected column</span><strong>{analysis.metrics?.detected_col || 'N/A'}</strong></div>
                      <div className="metric-row"><span>Average rating</span><strong>{Number(analysis.metrics?.avg_rating || 0).toFixed(2)} / 5</strong></div>
                      <div className="metric-row"><span>Sentiment score</span><strong>{analysis.metrics?.sentiment_score ?? 'N/A'}/100</strong></div>
                      <div className="metric-row"><span>Risk Level</span><strong>{analysis.metrics?.risk_level || 'Unknown'}</strong></div>
                      <div className="metric-row"><span>Blockchain</span><strong>{analysis.blockchainVerification?.success ? 'Verified' : 'Pending'}</strong></div>
                    </div>
                  ) : <Empty title="Metrics will appear here" description="Run an analysis to populate the metrics panel." />}
                </Panel>
              </div>

              <Panel title="Complaint Analysis" subtitle="Top complaint categories identified from negative reviews.">
                {analysis.complaintCategories?.length > 0 ? (
                  <div className="stack" style={{ gap: 12 }}>
                    {analysis.complaintCategories.slice(0, 5).map((c, i) => (
                      <div key={i} className="insight-box">
                        <div className="insight-box__icon"><AlertCircle size={18} /></div>
                        <div><strong>{c.category}</strong><p>{c.count} reviews ({c.percentage}% of negatives)</p></div>
                      </div>
                    ))}
                  </div>
                ) : <Empty title="No complaint data available" description="Upload a CSV with review text to see complaint categorization." />}
              </Panel>

              <Panel title="Analysis summary" subtitle="A board-ready narrative generated from the live dataset.">
                {hasAnalysis ? (
                  <div className="stack" style={{ gap: 12 }}>
                    {(genInsights(analysis) || [{ title: 'Analysis complete', description: 'Your review data has been analyzed. Use the metrics, sentiment split, and complaint categories above to understand customer feedback trends.' }]).map((ins, i) => (
                      <div key={i} className="insight-box">
                        <div className="insight-box__icon"><ArrowRight size={18} /></div>
                        <div><strong>{ins.title}</strong><p>{ins.description}</p></div>
                      </div>
                    ))}
                  </div>
                ) : <Empty title="No analysis summary yet" description="Upload data to generate recommendations and root-cause insights." />}
              </Panel>
            </div>
          )}

          {tab === 'reports' && (
            <div className="stack">
              <div className="grid grid--2">
                <StatCard icon={Download} label="Export status" value={reportBusy ? 'Working' : 'Ready'} accent={reportBusy ? '#d97706' : '#059669'} caption={reportStatus} />
                <StatCard icon={FileText} label="Analysis coverage" value={fmt(analysis.analysisMetadata?.totalReviewsAnalyzed || total)} accent="#2563eb" caption="Rows reflected in report" />
              </div>
              <Panel title="PDF export" subtitle="Generate a clean report with charts, plain headings, and production typography.">
                {!can('report') && <div className="locked-panel"><strong>PDF export is unlocked on the Small Business tier.</strong></div>}
                <div className="report-card">
                  <div><strong>Create the latest analysis report</strong>
                    <p>The PDF includes sentiment visuals, complaint analysis, AI insights, and chain status.</p>
                  </div>
                  <button className="primary-button" onClick={generateReport} disabled={!hasAnalysis || reportBusy || !can('report')}>
                    <Download size={16} />{reportBusy ? 'Generating...' : 'Generate PDF'}
                  </button>
                </div>
              </Panel>
            </div>
          )}

          {tab === 'blockchain' && (can('blockchain') ? <BlockchainPanel /> : (
            <Panel title="Blockchain verification" subtitle="Unlocked on Small Business tier and above.">
              <div className="locked-panel"><strong>Upgrade to access blockchain verification.</strong></div>
            </Panel>
          ))}

          {tab === 'chat' && (
            <Panel title="Conversation assistant" subtitle="Ask about trends, risks, and next actions."
              action={<button className="primary-button" onClick={() => setChatOpen(true)} disabled={!hasAnalysis || !can('chat')}><MessageCircle size={16} />Open Chat</button>}>
              {!can('chat') && <div className="locked-panel"><strong>Chat is available on Small Business and Enterprise tiers.</strong></div>}
              <div className="insight-box">
                <div className="insight-box__icon"><MessageCircle size={18} /></div>
                <div><strong>Ask focused business questions.</strong>
                  <p>Try: "What are the top complaints?" or "What should we prioritize this week?"</p>
                </div>
              </div>
            </Panel>
          )}
        </section>
      </main>

      {chatOpen && <ChatDrawer analysis={analysis} sessionId={sessionId} onClose={() => setChatOpen(false)} />}

      <footer className="footer">
        <span>ReviewMind</span>
        <span>AI analysis · blockchain integrity · PDF reporting</span>
      </footer>
    </div>
  );
}