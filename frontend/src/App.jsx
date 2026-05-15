import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Download,
  EyeOff,
  FileText,
  Fingerprint,
  KeyRound,
  LayoutDashboard,
  LogIn,
  LogOut,
  MessageCircle,
  Moon,
  QrCode,
  RefreshCcw,
  Send,
  ShieldCheck,
  Sun,
  Upload,
  UserPlus,
  Zap
} from 'lucide-react';

const API_BASE = 'http://localhost:3000';
const STORAGE_KEYS = {
  token: 'reviewmind_token',
  email: 'reviewmind_email',
  plan: 'reviewmind_plan',
  debug: 'reviewmind_debug_mode',
  theme: 'reviewmind_theme'
};

const SUBSCRIPTION_PLANS = {
  basic: {
    key: 'basic',
    name: 'Basic Free',
    price: '$0',
    description: 'Core review analysis with limited export and collaboration features.',
    accent: '#64748b',
    features: {
      analysis: true,
      timeSeries: true,
      blockchain: false,
      chat: false,
      report: false,
      debug: false
    }
  },
  business: {
    key: 'business',
    name: 'Small Business',
    price: '$150',
    description: 'Adds reporting, blockchain verification, and the assistant for team workflows.',
    accent: '#2563eb',
    features: {
      analysis: true,
      timeSeries: true,
      blockchain: true,
      chat: true,
      report: true,
      debug: false
    }
  },
  enterprise: {
    key: 'enterprise',
    name: 'Enterprise',
    price: '$200',
    description: 'Unlocks the full workspace with advanced visibility and debug tooling.',
    accent: '#7c3aed',
    features: {
      analysis: true,
      timeSeries: true,
      blockchain: true,
      chat: true,
      report: true,
      debug: true
    }
  }
};

const PLAN_ORDER = ['basic', 'business', 'enterprise'];

const SENTIMENT_COLORS = {
  Negative: '#dc2626',
  Neutral: '#d97706',
  Positive: '#059669'
};

const initialAnalysis = {
  pieData: [],
  timeSeriesData: [],
  metrics: {
    total_reviews: 0,
    avg_rating: 0,
    detected_col: 'rating'
  },
  blockchainVerification: null,
  analysisMetadata: null
};

const defaultProgress = [
  { key: 'upload', label: 'CSV uploaded', status: 'idle' },
  { key: 'parse', label: 'CSV parsed', status: 'idle' },
  { key: 'python', label: 'Python analysis', status: 'idle' },
  { key: 'blockchain', label: 'Blockchain verification', status: 'idle' },
  { key: 'dashboard', label: 'Dashboard ready', status: 'idle' }
];

const formatNumber = (value) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue.toLocaleString() : '0';
};

const readStoredSession = () => {
  if (typeof window === 'undefined') {
    return null;
  }

  const token = window.localStorage.getItem(STORAGE_KEYS.token);
  const email = window.localStorage.getItem(STORAGE_KEYS.email);
  const plan = window.localStorage.getItem(STORAGE_KEYS.plan);

  if (!token) {
    return null;
  }

  return { token, email: email || '', plan: SUBSCRIPTION_PLANS[plan] ? plan : 'basic' };
};

const readDebugPreference = () => {
  if (typeof window === 'undefined') {
    return false;
  }

  const params = new URLSearchParams(window.location.search);
  return params.get('debug') === '1' || window.localStorage.getItem(STORAGE_KEYS.debug) === '1';
};

const readResetTokenFromUrl = () => {
  if (typeof window === 'undefined') {
    return '';
  }

  const params = new URLSearchParams(window.location.search);
  return params.get('resetToken') || '';
};

const readStoredTheme = () => {
  if (typeof window === 'undefined') {
    return 'light';
  }

  const stored = window.localStorage.getItem(STORAGE_KEYS.theme);
  return stored === 'dark' ? 'dark' : 'light';
};

const persistTheme = (theme) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(STORAGE_KEYS.theme, theme);
  document.documentElement.setAttribute('data-theme', theme);
};

const readStoredPlan = () => {
  if (typeof window === 'undefined') {
    return 'basic';
  }

  const storedPlan = window.localStorage.getItem(STORAGE_KEYS.plan);
  return SUBSCRIPTION_PLANS[storedPlan] ? storedPlan : 'basic';
};

const persistSession = (session) => {
  if (typeof window === 'undefined') {
    return;
  }

  if (session?.token) {
    window.localStorage.setItem(STORAGE_KEYS.token, session.token);
    window.localStorage.setItem(STORAGE_KEYS.email, session.email || '');
    window.localStorage.setItem(STORAGE_KEYS.plan, session.plan || 'basic');
  } else {
    window.localStorage.removeItem(STORAGE_KEYS.token);
    window.localStorage.removeItem(STORAGE_KEYS.email);
    window.localStorage.removeItem(STORAGE_KEYS.plan);
  }
};

const persistPlan = (planKey) => {
  if (typeof window === 'undefined') {
    return;
  }

  if (SUBSCRIPTION_PLANS[planKey]) {
    window.localStorage.setItem(STORAGE_KEYS.plan, planKey);
  }
};

const StatCard = ({ icon: Icon, label, value, caption, accent = '#2563eb' }) => (
  <div className="stat-card" style={{ '--accent': accent }}>
    <div className="stat-card__icon">
      <Icon size={20} />
    </div>
    <div className="stat-card__body">
      <div className="stat-card__label">{label}</div>
      <div className="stat-card__value">{value}</div>
      {caption ? <div className="stat-card__caption">{caption}</div> : null}
    </div>
  </div>
);

const Panel = ({ title, subtitle, action, children, className = '' }) => (
  <section className={`panel ${className}`.trim()}>
    <div className="panel__header">
      <div>
        <h3>{title}</h3>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {action}
    </div>
    {children}
  </section>
);

const Badge = ({ tone = 'neutral', children }) => <span className={`badge badge--${tone}`}>{children}</span>;

const getSentimentColor = (name) => SENTIMENT_COLORS[name] || '#2563eb';

const generateInsights = (analysis) => {
  if (!analysis?.pieData || analysis.pieData.length === 0) {
    return null;
  }

  const totalReviews = analysis.pieData.reduce((sum, item) => sum + (item.value || 0), 0);
  if (totalReviews === 0) return null;

  const positive = analysis.pieData.find((item) => item.name === 'Positive')?.value || 0;
  const negative = analysis.pieData.find((item) => item.name === 'Negative')?.value || 0;
  const neutral = analysis.pieData.find((item) => item.name === 'Neutral')?.value || 0;

  const positivePercent = Math.round((positive / totalReviews) * 100);
  const negativePercent = Math.round((negative / totalReviews) * 100);
  const avgRating = analysis.metrics?.avg_rating || 0;

  const insights = [];

  if (negativePercent >= 30) {
    insights.push({
      title: 'Address negative sentiment',
      description: `${negativePercent}% of reviews express negative sentiment. Focus on the main pain points first to improve customer satisfaction.`
    });
  }

  if (positivePercent >= 60) {
    insights.push({
      title: 'Capitalize on positive momentum',
      description: `${positivePercent}% of customers are happy. Promote these positive experiences and identify what's working well.`
    });
  }

  if (avgRating < 3) {
    insights.push({
      title: 'Rating trend requires attention',
      description: `Average rating of ${avgRating.toFixed(1)}/5 indicates significant room for improvement. Investigate the root causes of low ratings.`
    });
  } else if (avgRating >= 4) {
    insights.push({
      title: 'Strong customer satisfaction',
      description: `Average rating of ${avgRating.toFixed(1)}/5 shows strong customer satisfaction. Use this data to guide product development.`
    });
  }

  if (neutral >= 20 && neutral <= 40) {
    insights.push({
      title: 'Engage neutral reviewers',
      description: `${Math.round((neutral / totalReviews) * 100)}% of feedback is neutral. These customers have untapped potential—consider improvements that could convert them to positive.`
    });
  }

  return insights.length > 0 ? insights : null;
};

const SentimentEmptyState = ({ title, description }) => (
  <div className="empty-state">
    <strong>{title}</strong>
    <p>{description}</p>
  </div>
);

const AuthTabs = ({ view, onChange }) => {
  const tabs = [
    { key: 'login', label: 'Sign in', icon: LogIn },
    { key: 'signup', label: 'Create account', icon: UserPlus },
    { key: 'forgot', label: 'Forgot password', icon: EyeOff },
    { key: 'mfa', label: 'MFA verify', icon: KeyRound }
  ];

  return (
    <div className="auth-tabs">
      {tabs.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          type="button"
          className={view === key ? 'auth-tab auth-tab--active' : 'auth-tab'}
          onClick={() => onChange(key)}
        >
          <Icon size={16} />
          {label}
        </button>
      ))}
    </div>
  );
};

const ChatDrawer = ({ analysis, onClose }) => {
  const [conversationId, setConversationId] = useState('');
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Ask me about the review trends, customer sentiment, risks, or next actions.' }
  ]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const response = await axios.post(`${API_BASE}/api/advanced/chat/conversation`, {
          analysisContext: {
            totalReviews: analysis?.metrics?.total_reviews || 0,
            avgRating: analysis?.metrics?.avg_rating || 0,
            sentimentData: analysis?.pieData || []
          }
        });

        setConversationId(response.data.conversationId);
      } catch (error) {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: 'Chat service is not reachable right now. You can still continue the analysis.' }
        ]);
      }
    };

    bootstrap();
  }, [analysis]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    const trimmed = message.trim();
    if (!trimmed || !conversationId || busy) return;

    setMessage('');
    setMessages((prev) => [...prev, { role: 'user', content: trimmed }]);
    setBusy(true);

    try {
      const response = await axios.post(`${API_BASE}/api/advanced/chat/message`, {
        conversationId,
        message: trimmed
      });

      setMessages((prev) => [...prev, { role: 'assistant', content: response.data.assistantResponse }]);
    } catch (error) {
      setMessages((prev) => [...prev, { role: 'assistant', content: 'I could not answer that right now. Please try again in a moment.' }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="chat-drawer">
      <div className="chat-drawer__header">
        <div>
          <div className="chat-drawer__eyebrow">ReviewMind AI</div>
          <h3>Strategy Assistant</h3>
        </div>
        <button className="icon-button" onClick={onClose} aria-label="Close chat">
          <ArrowRight size={18} />
        </button>
      </div>

      <div className="chat-drawer__messages">
        {messages.map((entry, index) => (
          <div key={`${entry.role}-${index}`} className={`chat-bubble chat-bubble--${entry.role}`}>
            {entry.content}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <div className="chat-drawer__composer">
        <input
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && sendMessage()}
          placeholder="Ask about the review data..."
        />
        <button className="primary-button" onClick={sendMessage} disabled={busy}>
          <Send size={16} />
          Send
        </button>
      </div>
    </div>
  );
};

const BlockchainPanel = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);

  const loadStats = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_BASE}/api/advanced/blockchain/stats`);
      setStats(response.data.statistics || null);
    } catch (error) {
      setStats(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  return (
    <div className="stack">
      <div className="grid grid--3">
        <StatCard icon={Fingerprint} label="Verified Reviews" value={formatNumber(stats?.totalReviews || 0)} accent="#0f766e" />
        <StatCard icon={ShieldCheck} label="Blocks" value={formatNumber(stats?.totalBlocks || 0)} accent="#2563eb" />
        <StatCard
          icon={CheckCircle2}
          label="Chain State"
          value={stats?.chainValid ? 'VALID' : 'PENDING'}
          accent={stats?.chainValid ? '#059669' : '#d97706'}
          caption={stats?.chainValid ? 'Integrity verified' : 'Waiting for verification'}
        />
      </div>

      <Panel
        title="Ledger Integrity"
        subtitle="Every review can be verified and tampering is detectable through the chain hash."
        action={
          <button className="ghost-button" onClick={loadStats} disabled={loading}>
            <RefreshCcw size={16} />
            Refresh
          </button>
        }
      >
        <div className="integrity-card">
          <div className="integrity-card__icon"><ShieldCheck size={20} /></div>
          <div>
            <strong>Blockchain verification is enabled.</strong>
            <p>Use this section to confirm the ledger state before sharing reports with stakeholders.</p>
          </div>
        </div>
      </Panel>
    </div>
  );
};

const AuthScreen = ({
  authView,
  setAuthView,
  authForm,
  setAuthForm,
  authLoading,
  authError,
  authNotice,
  authHint,
  signupQr,
  resetLink,
  resetToken,
  pendingEmail,
  signupPlan,
  setSignupPlan,
  onSubmit
}) => (
  <div className="auth-shell">
    <div className="ambient ambient--one" />
    <div className="ambient ambient--two" />

    <div className="auth-grid">
      <section className="auth-hero">
        <Badge tone="brand">ReviewMind Secure Access</Badge>
        <h1>Sign in to the review intelligence workspace.</h1>
        <p>
          ReviewMind is built as a secure product flow: authenticate first, then upload data, verify the ledger,
          chat with the assistant, and export a board-ready report.
        </p>

        <div className="purpose-strip">
          <div className="purpose-card">
            <strong>1. Ingest</strong>
            <span>Upload CSV review data and run analysis.</span>
          </div>
          <div className="purpose-card">
            <strong>2. Verify</strong>
            <span>Confirm blockchain integrity before sharing results.</span>
          </div>
          <div className="purpose-card">
            <strong>3. Export</strong>
            <span>Generate PDF reports and use the chat assistant.</span>
          </div>
        </div>
      </section>

      <section className="auth-card">
        <AuthTabs view={authView} onChange={setAuthView} />

        {authNotice ? (
          <div className="notice notice--info">
            <CheckCircle2 size={16} />
            <span>{authNotice}</span>
          </div>
        ) : null}

        {authHint ? (
          <div className="notice notice--info">
            <Fingerprint size={16} />
            <span>{authHint}</span>
          </div>
        ) : null}

        {authError ? (
          <div className="notice notice--error">
            <AlertCircle size={16} />
            <span>{authError}</span>
          </div>
        ) : null}

        {signupQr ? (
          <div className="qr-card">
            <div className="qr-card__header">
              <QrCode size={16} />
              <strong>MFA setup</strong>
            </div>
            <img src={signupQr} alt="MFA QR code" />
            <p>Scan this QR code in your authenticator app, then continue to sign in and verify MFA.</p>
          </div>
        ) : null}

        {resetLink ? (
          <div className="qr-card">
            <div className="qr-card__header">
              <KeyRound size={16} />
              <strong>Password reset link</strong>
            </div>
            <p>Open the link below or paste the token into the reset form.</p>
            <div className="field field--readonly">
              <span>Reset link</span>
              <strong style={{ wordBreak: 'break-all' }}>{resetLink}</strong>
            </div>
            {resetToken ? (
              <div className="field field--readonly">
                <span>Reset token</span>
                <strong style={{ wordBreak: 'break-all' }}>{resetToken}</strong>
              </div>
            ) : null}
          </div>
        ) : null}

        <form className="auth-form" onSubmit={onSubmit}>
          {authView === 'forgot' ? (
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                autoComplete="email"
                value={authForm.email}
                onChange={(event) => setAuthForm((prev) => ({ ...prev, email: event.target.value }))}
                placeholder="you@company.com"
                required
              />
            </label>
          ) : authView === 'reset' ? (
            <>
              <label className="field">
                <span>Reset token</span>
                <input
                  type="text"
                  value={authForm.token}
                  onChange={(event) => setAuthForm((prev) => ({ ...prev, token: event.target.value }))}
                  placeholder="Paste the token from the reset link"
                  required
                />
              </label>

              <label className="field">
                <span>New password</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={authForm.newPassword}
                  onChange={(event) => setAuthForm((prev) => ({ ...prev, newPassword: event.target.value }))}
                  placeholder="Enter a new password"
                  required
                />
              </label>

              <label className="field">
                <span>Confirm new password</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={authForm.confirmPassword}
                  onChange={(event) => setAuthForm((prev) => ({ ...prev, confirmPassword: event.target.value }))}
                  placeholder="Repeat the new password"
                  required
                />
              </label>
            </>
          ) : authView !== 'mfa' ? (
            <>
              <label className="field">
                <span>Email</span>
                <input
                  type="email"
                  autoComplete="email"
                  value={authForm.email}
                  onChange={(event) => setAuthForm((prev) => ({ ...prev, email: event.target.value }))}
                  placeholder="you@company.com"
                  required
                />
              </label>

              <label className="field">
                <span>Password</span>
                <input
                  type="password"
                  autoComplete={authView === 'signup' ? 'new-password' : 'current-password'}
                  value={authForm.password}
                  onChange={(event) => setAuthForm((prev) => ({ ...prev, password: event.target.value }))}
                  placeholder="Enter your password"
                  required
                />
              </label>

              {authView === 'signup' ? (
                <div className="field">
                  <span>Choose your plan</span>
                  <div className="plan-selector" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px', marginTop: '8px' }}>
                    {PLAN_ORDER.map((planKey) => {
                      const plan = SUBSCRIPTION_PLANS[planKey];
                      if (!plan) return null;
                      return (
                        <button
                          key={plan.key}
                          type="button"
                          onClick={() => setSignupPlan(plan.key)}
                          style={{
                            padding: '12px',
                            borderRadius: '8px',
                            border: signupPlan === plan.key ? `2px solid ${plan.accent}` : `1px solid var(--border)`,
                            background: signupPlan === plan.key ? 'var(--surface)' : 'transparent',
                            color: 'var(--dark)',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            fontWeight: signupPlan === plan.key ? '600' : '500',
                            fontSize: '14px'
                          }}
                        >
                          <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '4px' }}>{plan.name}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{plan.price}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <>
              <div className="field field--readonly">
                <span>Account</span>
                <strong>{pendingEmail || authForm.email || 'Email not set'}</strong>
              </div>

              <label className="field">
                <span>MFA code</span>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={authForm.token}
                  onChange={(event) => setAuthForm((prev) => ({ ...prev, token: event.target.value }))}
                  placeholder="123456"
                  required
                />
              </label>
            </>
          )}

          <button className="primary-button auth-submit" type="submit" disabled={authLoading}>
            {authLoading ? <RefreshCcw size={16} className="spin" /> : authView === 'signup' ? <UserPlus size={16} /> : authView === 'mfa' ? <KeyRound size={16} /> : <LogIn size={16} />}
            {authLoading ? 'Working...' : authView === 'signup' ? 'Create account' : authView === 'forgot' ? 'Send reset link' : authView === 'reset' ? 'Reset password' : authView === 'mfa' ? 'Verify MFA' : 'Sign in'}
          </button>
        </form>

        <div className="auth-footer-actions">
          {authView === 'signup' ? (
            <button type="button" className="ghost-button" onClick={() => setAuthView('login')}>
              Already have an account?
            </button>
          ) : null}

          {authView === 'login' && signupQr ? (
            <button type="button" className="ghost-button" onClick={() => setAuthView('mfa')}>
              I scanned the QR code
            </button>
          ) : null}

          {authView === 'login' ? (
            <button type="button" className="ghost-button" onClick={() => setAuthView('forgot')}>
              Forgot password?
            </button>
          ) : null}

          {authView === 'mfa' ? (
            <button type="button" className="ghost-button" onClick={() => setAuthView('login')}>
              Back to login
            </button>
          ) : null}

          {authView === 'forgot' || authView === 'reset' ? (
            <button type="button" className="ghost-button" onClick={() => setAuthView('login')}>
              Back to sign in
            </button>
          ) : null}
        </div>
      </section>
    </div>
  </div>
);

function App() {
  const [session, setSession] = useState(() => readStoredSession());
  const [subscriptionPlan, setSubscriptionPlan] = useState(() => readStoredSession()?.plan || readStoredPlan());
  const [authView, setAuthView] = useState(() => (readResetTokenFromUrl() ? 'reset' : 'login'));
  const [authForm, setAuthForm] = useState({
    email: '',
    password: '',
    token: readResetTokenFromUrl(),
    newPassword: '',
    confirmPassword: ''
  });
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authNotice, setAuthNotice] = useState('Sign in to unlock the workspace.');
  const [authHint, setAuthHint] = useState('');
  const [signupQr, setSignupQr] = useState('');
  const [resetLink, setResetLink] = useState('');
  const [resetToken, setResetToken] = useState(readResetTokenFromUrl());
  const [pendingEmail, setPendingEmail] = useState('');
  const [file, setFile] = useState(null);
  const [analysis, setAnalysis] = useState(initialAnalysis);
  const [pipelineProgress, setPipelineProgress] = useState(defaultProgress);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [tab, setTab] = useState('overview');
  const [chatOpen, setChatOpen] = useState(false);
  const [reportStatus, setReportStatus] = useState('No report generated yet.');
  const [reportBusy, setReportBusy] = useState(false);
  const [theme, setTheme] = useState(() => readStoredTheme());
  const [signupPlan, setSignupPlan] = useState('basic');
  const debugMode = useMemo(() => readDebugPreference(), []);
  const activePlan = SUBSCRIPTION_PLANS[subscriptionPlan] || SUBSCRIPTION_PLANS.basic;
  const canUseFeature = (featureKey) => Boolean(activePlan.features?.[featureKey]);
  const nextPlanKey = PLAN_ORDER[Math.min(PLAN_ORDER.indexOf(subscriptionPlan) + 1, PLAN_ORDER.length - 1)];

  useEffect(() => {
    persistTheme(theme);
  }, [theme]);

  useEffect(() => {
    const urlResetToken = readResetTokenFromUrl();
    if (urlResetToken) {
      setAuthView('reset');
      setAuthForm((prev) => ({ ...prev, token: urlResetToken }));
      setResetToken(urlResetToken);
    }
  }, []);

  useEffect(() => {
    if (session?.token) {
      axios.defaults.headers.common.Authorization = `Bearer ${session.token}`;
    } else {
      delete axios.defaults.headers.common.Authorization;
    }
  }, [session]);

  useEffect(() => {
    const loadSubscription = async () => {
      if (!session?.token) {
        return;
      }

      try {
        const response = await axios.get(`${API_BASE}/api/user/subscription`);
        const serverPlan = SUBSCRIPTION_PLANS[response.data?.subscriptionPlan] ? response.data.subscriptionPlan : 'basic';
        setSubscriptionPlan(serverPlan);
        setSession((currentSession) => {
          if (!currentSession) {
            return currentSession;
          }

          const nextSession = { ...currentSession, plan: serverPlan };
          persistSession(nextSession);
          return nextSession;
        });
      } catch (error) {
        if (error.response?.status === 401 || error.response?.status === 403) {
          persistSession(null);
          setSession(null);
          setSubscriptionPlan('basic');
          setAuthView('login');
          setAuthNotice('Your session expired. Please sign in again.');
          return;
        }

        const fallbackPlan = session?.plan && SUBSCRIPTION_PLANS[session.plan] ? session.plan : 'basic';
        setSubscriptionPlan(fallbackPlan);
      }
    };

    loadSubscription();
  }, [session?.token]);

  const hasAnalysis = (analysis?.pieData || []).length > 0;
  const hasTimeSeries = (analysis?.timeSeriesData || []).length > 1;
  const totalReviews = useMemo(
    () => analysis?.pieData?.reduce((sum, item) => sum + (Number(item.value) || 0), 0) || 0,
    [analysis]
  );
  const positiveReviews = useMemo(
    () => analysis?.pieData?.find((item) => item.name === 'Positive')?.value || 0,
    [analysis]
  );
  const negativeReviews = useMemo(
    () => analysis?.pieData?.find((item) => item.name === 'Negative')?.value || 0,
    [analysis]
  );
  const neutralReviews = useMemo(
    () => analysis?.pieData?.find((item) => item.name === 'Neutral')?.value || 0,
    [analysis]
  );
  const sentimentChartData = useMemo(
    () => (analysis?.pieData || []).map((item) => ({
      ...item,
      value: Number(item.value) || 0,
      fill: getSentimentColor(item.name)
    })),
    [analysis]
  );
  const trendChartData = useMemo(
    () => analysis?.timeSeriesData || [],
    [analysis]
  );

  const handleAuthSubmit = async (event) => {
    event.preventDefault();
    setAuthError('');
    setAuthNotice('');
    setAuthLoading(true);

    try {
      if (authView === 'signup') {
        const response = await axios.post(`${API_BASE}/api/auth/register`, {
          email: authForm.email,
          password: authForm.password,
          subscriptionPlan: signupPlan
        });

        setSignupQr(response.data.qrCode || '');
        setPendingEmail(authForm.email);
        setAuthForm((prev) => ({ ...prev, password: '', token: '' }));
        setAuthNotice('Account created. Scan the QR code in your authenticator app, then sign in.');
        setAuthView('login');
        return;
      }

      if (authView === 'forgot') {
        const response = await axios.post(`${API_BASE}/api/auth/forgot-password`, {
          email: authForm.email
        });

        const returnedResetToken = response.data.resetToken || '';
        const returnedResetLink = response.data.resetLink || '';

        setPendingEmail(authForm.email);
        setResetToken(returnedResetToken);
        setResetLink(returnedResetLink);
        setAuthForm((prev) => ({
          ...prev,
          token: returnedResetToken,
          newPassword: '',
          confirmPassword: ''
        }));
        setAuthNotice('Reset link created. Use the token below to set a new password.');
        setAuthView('reset');
        return;
      }

      if (authView === 'reset') {
        if (authForm.newPassword !== authForm.confirmPassword) {
          setAuthError('The new passwords do not match.');
          return;
        }

        const response = await axios.post(`${API_BASE}/api/auth/reset-password`, {
          token: authForm.token || resetToken,
          password: authForm.newPassword
        });

        setAuthNotice(response.data.message || 'Password updated successfully. Sign in with your new password.');
        setAuthError('');
        setAuthView('login');
        setResetLink('');
        setResetToken('');
        setAuthForm({
          email: pendingEmail || '',
          password: '',
          token: '',
          newPassword: '',
          confirmPassword: ''
        });
        return;
      }

      if (authView === 'login') {
        const response = await axios.post(`${API_BASE}/api/auth/login`, {
          email: authForm.email,
          password: authForm.password
        });

        if (response.data?.mfaRequired) {
          setPendingEmail(response.data.email || authForm.email);
          setSubscriptionPlan(response.data.subscriptionPlan || 'basic');
          setAuthForm((prev) => ({ ...prev, token: '' }));
          setAuthNotice('Password accepted. Enter your six-digit MFA code to finish signing in.');
          setAuthView('mfa');
        }
        return;
      }

      const response = await axios.post(`${API_BASE}/api/auth/verify-mfa`, {
        email: pendingEmail || authForm.email,
        token: authForm.token
      });

      const locationStatus = response.data?.mfa_report?.factor_3 || '';
      setAuthHint(locationStatus ? `Location check: ${locationStatus}` : 'Location check completed.');

      const nextSession = {
        token: response.data.token,
        email: pendingEmail || authForm.email,
        plan: response.data.subscriptionPlan || 'basic'
      };

      persistSession(nextSession);
      setSession(nextSession);
      setSubscriptionPlan(nextSession.plan);
      setAuthForm({ email: nextSession.email, password: '', token: '' });
      setAuthNotice('MFA verified. Welcome to the workspace.');
      setAuthError('');
      setTab('overview');
      setReportStatus('No report generated yet.');
    } catch (authSubmitError) {
      setAuthError(
        authSubmitError.response?.data?.error ||
        authSubmitError.response?.data?.message ||
        authSubmitError.message ||
        'Authentication failed.'
      );
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    persistSession(null);
    setSession(null);
    setSubscriptionPlan('basic');
    setAuthView('login');
    setAuthForm({ email: '', password: '', token: '', newPassword: '', confirmPassword: '' });
    setPendingEmail('');
    setSignupQr('');
    setResetLink('');
    setResetToken('');
    setAuthHint('');
    setAnalysis(initialAnalysis);
    setPipelineProgress(defaultProgress);
    setFile(null);
    setStatus('idle');
    setError('');
    setTab('overview');
    setChatOpen(false);
    setReportStatus('No report generated yet.');
  };

  const handlePlanChange = (planKey) => {
    if (!SUBSCRIPTION_PLANS[planKey]) return;

    const updatePlan = async () => {
      try {
        const response = await axios.patch(`${API_BASE}/api/user/subscription`, {
          plan: planKey,
          subscriptionPlan: planKey
        });

        const updatedPlan = response.data.subscriptionPlan;
        const refreshedToken = response.data.token;

        setSubscriptionPlan(updatedPlan);

        setSession((currentSession) => {
          if (!currentSession) return currentSession;

          const nextSession = {
            ...currentSession,
            plan: updatedPlan,
            token: refreshedToken
          };

          persistSession(nextSession);
          return nextSession;
        });

        setError('');
        setStatus('ready');
        setReportStatus(`Plan upgraded to ${SUBSCRIPTION_PLANS[updatedPlan]?.name || updatedPlan}.`);
      } catch (error) {
        if (error.response?.status === 401 || error.response?.status === 403) {
          persistSession(null);
          setSession(null);
          setSubscriptionPlan('basic');
          setAuthView('login');
          setAuthNotice('Your session expired. Please sign in again before upgrading.');
          return;
        }

        setError(error.response?.data?.error || 'Unable to update subscription plan.');
      }
    };

    updatePlan();
};

  const handleOpenChat = () => {
    if (!canUseFeature('chat')) {
      setTab('reports');
      setError('Open Chat is unlocked on the Small Business tier and above.');
      return;
    }

    setError('');
    setChatOpen(true);
  };

  const handleVerifyLedger = () => {
    if (!canUseFeature('blockchain')) {
      setTab('blockchain');
      setError('Verify ledger is unlocked on the Small Business tier and above.');
      return;
    }

    setError('');
    setTab('blockchain');
  };

  const uploadAndAnalyze = async () => {
  if (!file) {
    setError('Choose a CSV file first.');
    return;
  }

  setError('');
  setLoading(true);
  setStatus('uploading');

  try {
    const formData = new FormData();
    formData.append('file', file);

    // ✅ FIXED: Correct endpoint - /api/ml/upload-analyze
    const analysisResponse = await axios.post(`${API_BASE}/api/ml/upload-analyze`, formData);

    console.log('[Dashboard] API Response:', analysisResponse.data);

    const responseData = analysisResponse.data?.data || {};
    
    // Validate response
    if (!responseData.pieData || !Array.isArray(responseData.pieData)) {
      console.error('[Dashboard] Invalid response:', responseData);
      setError('Analysis response missing sentiment data');
      setStatus('error');
      return;
    }

    setAnalysis({
      ...initialAnalysis,
      ...responseData,
      pieData: responseData.pieData || [],
      metrics: responseData.metrics || { total_reviews: 0, avg_rating: 0 },
      timeSeriesData: analysisResponse.data?.timeSeriesData || [],
      blockchainVerification: analysisResponse.data?.blockchainVerification || null,
      analysisMetadata: analysisResponse.data?.analysisMetadata || null
    });

    setPipelineProgress([
      { key: 'upload', label: 'CSV uploaded', status: 'done' },
      { key: 'parse', label: 'CSV parsed', status: 'done' },
      { key: 'python', label: 'Python analysis', status: 'done' },
      { key: 'blockchain', label: 'Blockchain verification', status: 'done' },
      { key: 'dashboard', label: 'Dashboard ready', status: 'done' }
    ]);
    
    setTab('overview');
    setStatus('ready');
    setReportStatus('Analysis complete. You can export a PDF report now.');
    
  } catch (analysisError) {
    console.error('[Dashboard] Upload error:', analysisError);
    const errorMessage = 
      analysisError.response?.data?.error ||
      analysisError.response?.data?.details ||
      analysisError.message ||
      'Analysis failed. Make sure Python service is running on port 8000.';
    
    setError(errorMessage);
    setStatus('error');
    setPipelineProgress([
      { key: 'upload', label: 'CSV uploaded', status: 'done' },
      { key: 'parse', label: 'CSV parsed', status: 'done' },
      { key: 'python', label: 'Python analysis', status: 'error' },
      { key: 'blockchain', label: 'Blockchain verification', status: 'idle' },
      { key: 'dashboard', label: 'Dashboard ready', status: 'idle' }
    ]);
  } finally {
    setLoading(false);
  }
};

  const generateReport = async () => {
    if (!hasAnalysis) {
      setError('Run an analysis before generating a report.');
      return;
    }

    if (!canUseFeature('report')) {
      setError('PDF export is available on the Small Business and Enterprise tiers.');
      setTab('reports');
      return;
    }

    try {
      setReportBusy(true);
      setReportStatus('Generating PDF report...');
      const response = await axios.post(`${API_BASE}/api/advanced/reports/generate`, {
        analysisData: analysis
      });

      const report = response.data.report;
      const downloadUrl = report?.reportId
        ? `${API_BASE}/api/advanced/reports/download/${report.reportId}`
        : `${API_BASE}${report?.url || ''}`;

      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = report?.filename || 'reviewmind-report.pdf';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setStatus('ready');
      setReportStatus(`Report ready: ${report?.filename || 'reviewmind-report.pdf'}`);
    } catch (reportError) {
      console.error(reportError);
      setError(reportError.response?.data?.error || 'Report generation failed.');
      setStatus('error');
      setReportStatus('Report generation failed.');
    } finally {
      setReportBusy(false);
    }
  };

  if (!session?.token) {
    return (
      <AuthScreen
        authView={authView}
        setAuthView={setAuthView}
        authForm={authForm}
        setAuthForm={setAuthForm}
        authLoading={authLoading}
        authError={authError}
        authNotice={authNotice}
        authHint={authHint}
        signupQr={signupQr}
        resetLink={resetLink}
        resetToken={resetToken}
        pendingEmail={pendingEmail}
        signupPlan={signupPlan}
        setSignupPlan={setSignupPlan}
        onSubmit={handleAuthSubmit}
      />
    );
  }

  const navTabs = [
    { key: 'overview', label: 'Overview', icon: LayoutDashboard },
    { key: 'reports', label: 'Reports', icon: FileText },
    { key: 'blockchain', label: 'Blockchain', icon: ShieldCheck },
    { key: 'chat', label: 'Chat', icon: MessageCircle }
  ];

  if (debugMode) {
    navTabs.push({ key: 'debug', label: 'Debug', icon: Fingerprint });
  }

  return (
    <div className="app-shell">
      <div className="ambient ambient--one" />
      <div className="ambient ambient--two" />

      <header className="hero hero--dashboard">
        <div className="hero__copy">
          <Badge tone="brand">Authenticated workspace</Badge>
          <h1>ReviewMind production dashboard.</h1>
          <p>
            Purpose: upload review data, analyze sentiment, verify the chain, chat with the assistant, and export
            clean reports. The raw payload view stays hidden unless developer mode is enabled.
          </p>
        </div>

        <div className="hero__actions hero__actions--stacked">
          <div className="session-chip">
            <strong>{session.email || 'Authenticated user'}</strong>
            <span>Signed in</span>
          </div>
          <div className="subscription-chip">
            <strong>{activePlan.name}</strong>
            <span>{activePlan.price} plan</span>
          </div>
          <button className="secondary-button" onClick={handleOpenChat}>
            <MessageCircle size={16} />
            Open Chat
          </button>
          <button className="primary-button" onClick={generateReport} disabled={reportBusy}>
            {reportBusy ? <RefreshCcw size={16} className="spin" /> : <Download size={16} />}
            {reportBusy ? 'Generating...' : 'PDF Report'}
          </button>
          <button 
            className="ghost-button" 
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
          >
            {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
          </button>
          <button className="ghost-button" onClick={handleLogout}>
            <LogOut size={16} />
            Sign out
          </button>
        </div>
      </header>

      <main className="layout">
        <section className="upload-card">
          <div className="upload-card__header">
            <div>
              <h2>Upload data</h2>
              <p>CSV with a rating-like column such as rating, score, stars, or points.</p>
            </div>
            <Badge tone={status === 'ready' ? 'success' : status === 'error' ? 'danger' : 'neutral'}>
              {status === 'ready' ? 'Ready' : status === 'error' ? 'Needs attention' : 'Idle'}
            </Badge>
          </div>

          <label className="dropzone" htmlFor="reviewmind-file">
            <input
              id="reviewmind-file"
              type="file"
              accept=".csv"
              onChange={(event) => setFile(event.target.files?.[0] || null)}
            />
            <Upload size={30} />
            <strong>{file ? file.name : 'Drop your CSV here or browse'}</strong>
            <span>Run analysis, blockchain verification, and report generation from one flow.</span>
          </label>

          {error ? (
            <div className="error-box">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          ) : null}

          <div className="upload-card__actions">
            <button className="primary-button" onClick={uploadAndAnalyze} disabled={loading}>
              {loading ? <RefreshCcw size={16} className="spin" /> : <Zap size={16} />}
              {loading ? 'Analyzing...' : 'Analyze reviews'}
            </button>
            <button className="ghost-button" onClick={handleVerifyLedger}>
              <Fingerprint size={16} />
              Verify ledger
            </button>
          </div>
        </section>

        <section className="workspace">
          <div className="workspace__purpose">
            <div>
              <h2>Why this page exists</h2>
              <p>
                This workspace turns raw review data into sentiment analysis, trust verification, report exports,
                and assistant-driven follow-up without exposing debug payloads to normal users.
              </p>
            </div>
            <div className="workspace__meta">
              <Badge tone={hasAnalysis ? 'success' : 'neutral'}>{hasAnalysis ? 'Analysis loaded' : 'Awaiting data'}</Badge>
              <span>{reportStatus}</span>
            </div>
          </div>

          <Panel
            title="Subscription"
            subtitle="Your current plan and available upgrades."
            action={<Badge tone="brand">Current: {activePlan.name}</Badge>}
          >
            <div className="metric-list metric-list--loose">
              <div className="metric-row">
                <span>Plan</span>
                <strong>{activePlan.name} {activePlan.price}</strong>
              </div>
              <div className="metric-row">
                <span>Features</span>
                <strong>{Object.values(activePlan.features).filter(Boolean).length} of 6 unlocked</strong>
              </div>
            </div>

            {subscriptionPlan !== 'enterprise' ? (
              <div style={{ marginTop: '16px', padding: '16px', background: 'var(--surface)', borderRadius: '12px', border: `1px solid var(--border)` }}>
                <div style={{ marginBottom: '12px' }}>
                  <strong>Next tier: {SUBSCRIPTION_PLANS[nextPlanKey].name}</strong>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    Unlock PDF reports, chat assistant, and blockchain verification.
                  </p>
                </div>
                <button className="primary-button" onClick={() => handlePlanChange(nextPlanKey)}>
                  Upgrade to {SUBSCRIPTION_PLANS[nextPlanKey].name}
                </button>
              </div>
            ) : (
              <div style={{ marginTop: '16px', padding: '16px', background: 'var(--surface)', borderRadius: '12px', border: `1px solid var(--border)` }}>
                <strong>You have the Enterprise tier!</strong>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  All features are unlocked. Contact support for custom requirements.
                </p>
              </div>
            )}
          </Panel>

          <Panel title="Backend progress" subtitle="What the server has already completed for this run.">
            <div className="pipeline-list">
              {pipelineProgress.map((step) => (
                <div key={step.key} className={`pipeline-step pipeline-step--${step.status}`}>
                  <span className="pipeline-step__dot" />
                  <div>
                    <strong>{step.label}</strong>
                    <p>
                      {step.status === 'done'
                        ? 'Completed'
                        : step.status === 'error'
                          ? 'Failed'
                          : step.status === 'running'
                            ? 'In progress'
                            : 'Waiting'}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {analysis?.analysisMetadata ? (
              <div className="metric-list metric-list--loose" style={{ marginTop: '16px' }}>
                <div className="metric-row">
                  <span>Total reviews analyzed</span>
                  <strong>{analysis.analysisMetadata.totalReviewsAnalyzed || totalReviews}</strong>
                </div>
                <div className="metric-row">
                  <span>Python service</span>
                  <strong>{analysis.analysisMetadata.pythonServiceStatus || 'Unknown'}</strong>
                </div>
                <div className="metric-row">
                  <span>Blockchain status</span>
                  <strong>{analysis.analysisMetadata.blockchainStatus || 'Unknown'}</strong>
                </div>
                <div className="metric-row">
                  <span>Analysis time</span>
                  <strong>{analysis.analysisMetadata.analysisTime || 'Unknown'}</strong>
                </div>
              </div>
            ) : null}
          </Panel>

          <div className="tabs">
            {navTabs.map((item) => (
              <button
                key={item.key}
                className={tab === item.key ? 'tab tab--active' : 'tab'}
                onClick={() => setTab(item.key)}
              >
                <item.icon size={15} />
                {item.label}
              </button>
            ))}
          </div>

          {tab === 'overview' ? (
            <div className="stack stack--xl">
              <div className="grid grid--4">
                <StatCard icon={FileText} label="Total reviews" value={formatNumber(totalReviews)} accent="#2563eb" caption="From uploaded data" />
                <StatCard icon={CheckCircle2} label="Positive" value={formatNumber(positiveReviews)} accent="#059669" caption="Good experiences" />
                <StatCard icon={AlertCircle} label="Negative" value={formatNumber(negativeReviews)} accent="#dc2626" caption="Needs action" />
                <StatCard icon={ShieldCheck} label="Neutral" value={formatNumber(neutralReviews)} accent="#d97706" caption="Potential follow-up" />
              </div>

              <div className="grid grid--2">
                <Panel title="Sentiment split" subtitle="Auto-clustered from the uploaded dataset.">
                  {hasAnalysis ? (
                    <ResponsiveContainer width="100%" height={320}>
                      <PieChart>
                        <Pie data={analysis?.pieData || []} dataKey="value" nameKey="name" outerRadius={110} innerRadius={60} paddingAngle={4}>
                          {(analysis?.pieData || []).map((entry) => (
                            <Cell key={entry.name} fill={getSentimentColor(entry.name)} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <SentimentEmptyState title="No sentiment data yet" description="Upload a CSV to generate the sentiment split and trend charts." />
                  )}
                  {hasAnalysis ? (
                    <div style={{ marginTop: '18px' }}>
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={sentimentChartData} layout="vertical" margin={{ left: 16, right: 16, top: 8, bottom: 8 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.2)" />
                          <XAxis type="number" tick={{ fill: '#64748b', fontSize: 12 }} allowDecimals={false} />
                          <YAxis type="category" dataKey="name" tick={{ fill: '#64748b', fontSize: 12 }} width={80} />
                          <Tooltip
                            contentStyle={{
                              background: 'var(--surface-strong)',
                              border: '1px solid var(--border)',
                              borderRadius: '12px',
                              color: 'var(--primary-strong)'
                            }}
                          />
                          <Bar dataKey="value" radius={[0, 12, 12, 0]}>
                            {sentimentChartData.map((entry) => (
                              <Cell key={entry.name} fill={entry.fill} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : null}
                </Panel>

                <Panel
                  title="Live metrics"
                  subtitle="Rendered directly from the Python analysis response."
                  action={
                    <button className="ghost-button" onClick={generateReport} disabled={!hasAnalysis || reportBusy || !canUseFeature('report')}>
                      <Download size={16} />
                      Download
                    </button>
                  }
                >
                  {hasAnalysis ? (
                    <div className="metric-list">
                      <div className="metric-row">
                        <span>Detected column</span>
                        <strong>{analysis?.metrics?.detected_col || 'rating'}</strong>
                      </div>
                      <div className="metric-row">
                        <span>Average rating</span>
                        <strong>{Number(analysis?.metrics?.avg_rating || 0).toFixed(2)} / 5</strong>
                      </div>
                      <div className="metric-row">
                        <span>Analysis mode</span>
                        <strong>{analysis?.metrics?.model_mode || 'Clustered review intelligence'}</strong>
                      </div>
                      <div className="metric-row">
                        <span>Blockchain</span>
                        <strong>{analysis?.blockchainVerification?.success ? 'Verified' : 'Pending'}</strong>
                      </div>
                    </div>
                  ) : (
                    <SentimentEmptyState title="Metrics will appear here" description="Run an analysis to populate the metrics panel." />
                  )}
                </Panel>
              </div>

              <Panel
                title="Time series analysis"
                subtitle="Rolling review trends and short-term ARIMA forecast from the uploaded rating sequence."
              >
                {hasTimeSeries ? (
                  <ResponsiveContainer width="100%" height={360}>
                    <AreaChart data={trendChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.3)" />
                      <XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 12 }} />
                      <YAxis tick={{ fill: '#64748b', fontSize: 12 }} domain={['auto', 'auto']} />
                      <Tooltip
                        contentStyle={{
                          background: 'var(--surface-strong)',
                          border: '1px solid var(--border)',
                          borderRadius: '12px'
                        }}
                      />
                      <Legend />
                      <Area
                        type="monotone"
                        dataKey="satisfaction"
                        name="Rating trend"
                        stroke="#2563eb"
                        fill="rgba(37, 99, 235, 0.15)"
                        strokeWidth={3}
                        activeDot={{ r: 6 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="reviews"
                        name="Review count"
                        stroke="#059669"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <SentimentEmptyState
                    title="Time series will appear here"
                    description="Upload a CSV with rating data to generate trend and forecast visuals."
                  />
                )}
              </Panel>

              <Panel title="Analysis summary" subtitle="A board-ready narrative generated from the live dataset.">
                {hasAnalysis ? (
                  <div className="stack" style={{ gap: '12px' }}>
                    {generateInsights(analysis)?.map((insight, index) => (
                      <div key={index} className="insight-box">
                        <div className="insight-box__icon">
                          <ArrowRight size={18} />
                        </div>
                        <div>
                          <strong>{insight.title}</strong>
                          <p>{insight.description}</p>
                        </div>
                      </div>
                    )) || (
                      <div className="insight-box">
                        <div className="insight-box__icon">
                          <ArrowRight size={18} />
                        </div>
                        <div>
                          <strong>Analysis complete</strong>
                          <p>
                            Your review data has been analyzed. Use the metrics, sentiment split, and time series
                            charts above to understand customer feedback trends.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <SentimentEmptyState title="No analysis summary yet" description="Upload data to generate recommendations and root-cause insights." />
                )}
              </Panel>
            </div>
          ) : null}

          {tab === 'reports' ? (
            <div className="stack">
              <div className="grid grid--2">
                <StatCard
                  icon={Download}
                  label="Export status"
                  value={reportBusy ? 'Working' : 'Ready'}
                  accent={reportBusy ? '#d97706' : '#059669'}
                  caption={reportStatus}
                />
                <StatCard
                  icon={FileText}
                  label="Analysis coverage"
                  value={formatNumber(analysis?.analysisMetadata?.totalReviewsAnalyzed || totalReviews)}
                  accent="#2563eb"
                  caption="Rows reflected in the report"
                />
              </div>

              <Panel title="PDF export" subtitle="Generate a clean report with charts, plain headings, and production typography.">
                {!canUseFeature('report') ? (
                  <div className="locked-panel">
                    <strong>PDF export is unlocked on the Small Business tier.</strong>
                    <p>Switch plans above to enable report generation, chat, and blockchain features.</p>
                  </div>
                ) : null}

                <div className="report-card">
                  <div>
                    <strong>{reportBusy ? 'Building report...' : 'Create the latest analysis report'}</strong>
                    <p>
                      The PDF includes sentiment visuals, rating distribution, trends, AI insights, and chain status.
                    </p>
                  </div>
                  <button className="primary-button" onClick={generateReport} disabled={!hasAnalysis || reportBusy || !canUseFeature('report')}>
                    <Download size={16} />
                    {reportBusy ? 'Generating...' : 'Generate PDF'}
                  </button>
                </div>

                <div className="metric-list metric-list--loose">
                  <div className="metric-row">
                    <span>Analysis time</span>
                    <strong>{analysis?.analysisMetadata?.analysisTime || 'Not generated yet'}</strong>
                  </div>
                  <div className="metric-row">
                    <span>Python service</span>
                    <strong>{analysis?.analysisMetadata?.pythonServiceStatus || 'Not checked yet'}</strong>
                  </div>
                  <div className="metric-row">
                    <span>Blockchain status</span>
                    <strong>{analysis?.analysisMetadata?.blockchainStatus || 'Not checked yet'}</strong>
                  </div>
                </div>
              </Panel>
            </div>
          ) : null}

          {tab === 'blockchain' && canUseFeature('blockchain') ? <BlockchainPanel /> : null}
          {tab === 'blockchain' && !canUseFeature('blockchain') ? (
            <Panel title="Blockchain verification" subtitle="This feature is unlocked on the Small Business tier and above.">
              <div className="locked-panel">
                <strong>Blockchain verification is a paid-tier capability.</strong>
                <p>Upgrade from Basic to unlock ledger checks, integrity stats, and chain review tools.</p>
              </div>
            </Panel>
          ) : null}

          {tab === 'chat' ? (
            <Panel
              title="Conversation assistant"
              subtitle="Open the contextual chat drawer to ask about trends, risks, and next actions."
              action={
                <button className="primary-button" onClick={() => setChatOpen(true)} disabled={!hasAnalysis || !canUseFeature('chat')}>
                  <MessageCircle size={16} />
                  Open Chat
                </button>
              }
            >
              {!canUseFeature('chat') ? (
                <div className="locked-panel">
                  <strong>Chat is available on Small Business and Enterprise tiers.</strong>
                  <p>Upgrade to enable the assistant and guided follow-up questions.</p>
                </div>
              ) : null}

              <div className="insight-box">
                <div className="insight-box__icon">
                  <MessageCircle size={18} />
                </div>
                <div>
                  <strong>Ask focused business questions.</strong>
                  <p>
                    Try prompts such as: why is sentiment falling, what are the strongest complaint themes, or what should
                    we prioritize this week?
                  </p>
                </div>
              </div>
            </Panel>
          ) : null}

          {tab === 'debug' && debugMode && canUseFeature('debug') ? (
            <Panel title="Raw payload" subtitle="Visible only in developer mode.">
              <pre className="json-panel">{JSON.stringify(analysis, null, 2)}</pre>
            </Panel>
          ) : null}
        </section>
      </main>

      {chatOpen ? <ChatDrawer analysis={analysis} onClose={() => setChatOpen(false)} /> : null}

      <footer className="footer">
        <span>ReviewMind</span>
        <span>AI analysis · blockchain integrity · PDF reporting</span>
      </footer>
    </div>
  );
}

export default App;
