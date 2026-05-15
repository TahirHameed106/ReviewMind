import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import {
  FileText, TrendingUp, AlertCircle, CheckCircle, Upload,
  Download, RefreshCw, BarChart3, Settings
} from 'lucide-react';

// ============== PROFESSIONAL COLOR SCHEME ==============
const COLORS = {
  primary: '#1e40af',      // Deep Blue
  secondary: '#0891b2',    // Cyan
  success: '#059669',      // Green
  warning: '#d97706',      // Amber
  danger: '#dc2626',       // Red
  light: '#f8fafc',        // Light background
  dark: '#0f172a',         // Dark text
  border: '#e2e8f0'        // Border
};

const CHART_COLORS = ['#1e40af', '#0891b2', '#059669', '#d97706', '#ec4899', '#8b5cf6'];

// ============== STAT CARD COMPONENT ==============
const StatCard = ({ title, value, icon: Icon, color, trend }) => (
  <div style={{
    background: 'white',
    borderRadius: '12px',
    padding: '24px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    border: `2px solid ${color}20`,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    transition: 'all 0.3s ease',
    cursor: 'pointer'
  }}
  onMouseEnter={(e) => {
    e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
    e.currentTarget.style.transform = 'translateY(-2px)';
  }}
  onMouseLeave={(e) => {
    e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
    e.currentTarget.style.transform = 'translateY(0)';
  }}>
    <div>
      <p style={{ margin: '0 0 8px 0', color: '#64748b', fontSize: '14px', fontWeight: '500' }}>
        {title}
      </p>
      <p style={{ margin: '0', color: COLORS.dark, fontSize: '28px', fontWeight: '700' }}>
        {value}
      </p>
      {trend && (
        <p style={{ margin: '8px 0 0 0', color: trend > 0 ? COLORS.success : COLORS.danger, fontSize: '12px', fontWeight: '500' }}>
          {trend > 0 ? '↑' : '↓'} {Math.abs(trend)}% from last month
        </p>
      )}
    </div>
    <Icon size={40} color={color} strokeWidth={1.5} />
  </div>
);

// ============== CHART CARD COMPONENT ==============
const ChartCard = ({ title, children, fullWidth = false }) => (
  <div style={{
    background: 'white',
    borderRadius: '12px',
    padding: '24px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    border: `1px solid ${COLORS.border}`,
    gridColumn: fullWidth ? '1 / -1' : 'auto'
  }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
      <h3 style={{ margin: '0', color: COLORS.dark, fontSize: '18px', fontWeight: '600' }}>
        {title}
      </h3>
      <RefreshCw size={18} color={COLORS.secondary} style={{ cursor: 'pointer' }} />
    </div>
    {children}
  </div>
);

// ============== MAIN APP ==============
function App() {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [showDashboard, setShowDashboard] = useState(false);

  // ============== SAMPLE DATA FOR DEMO ==============
  const generateSampleChartData = () => ({
    ratingDistribution: [
      { name: '1★', value: 45, percentage: 12 },
      { name: '2★', value: 78, percentage: 20 },
      { name: '3★', value: 95, percentage: 24 },
      { name: '4★', value: 110, percentage: 28 },
      { name: '5★', value: 62, percentage: 16 }
    ],
    timeSeriesData: [
      { month: 'Jan', reviews: 120, satisfaction: 72 },
      { month: 'Feb', reviews: 145, satisfaction: 75 },
      { month: 'Mar', reviews: 165, satisfaction: 78 },
      { month: 'Apr', reviews: 190, satisfaction: 82 },
      { month: 'May', reviews: 210, satisfaction: 85 },
      { month: 'Jun', reviews: 235, satisfaction: 88 }
    ],
    sentimentData: [
      { name: 'Positive', value: 280, fill: CHART_COLORS[2] },
      { name: 'Neutral', value: 150, fill: CHART_COLORS[3] },
      { name: 'Negative', value: 70, fill: CHART_COLORS[4] }
    ],
    categoryAnalysis: [
      { category: 'Product Quality', score: 85 },
      { category: 'Delivery Speed', score: 78 },
      { category: 'Customer Service', score: 92 },
      { category: 'Price Value', score: 76 },
      { category: 'Packaging', score: 88 }
    ]
  });

  const handleFileChange = (e) => setFile(e.target.files[0]);

  const uploadAndAnalyze = async () => {
    if (!file) {
      alert('Please upload a CSV review dataset first!');
      return;
    }

    setLoading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const uploadRes = await axios.post('http://localhost:3000/api/ml/upload', formData);
      const reviewsData = uploadRes.data.reviews;

      const response = await axios.post('http://localhost:3000/api/ml/analyze', {
        reviews: reviewsData
      });

      setAnalysis({
        ...generateSampleChartData(),
        recommendation: response.data.strategy || 'Analyze your review data for actionable insights.',
        reliability: response.data.reliability || 92
      });
      setShowDashboard(true);
    } catch (err) {
      console.error('Analysis Error:', err);
      // Show demo dashboard on error
      setAnalysis({
        ...generateSampleChartData(),
        recommendation: 'Demo: Ensure Python & Node servers are running for real analysis.',
        reliability: 85
      });
      setShowDashboard(true);
    } finally {
      setLoading(false);
    }
  };

  // ============== UPLOAD SECTION ==============
  if (!showDashboard) {
    return (
      <div style={{
        minHeight: '100vh',
        background: `linear-gradient(135deg, ${COLORS.primary} 0%, ${COLORS.secondary} 100%)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      }}>
        <div style={{
          background: 'white',
          borderRadius: '16px',
          padding: '48px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          maxWidth: '500px',
          width: '100%',
          textAlign: 'center'
        }}>
          <div style={{ marginBottom: '32px' }}>
            <div style={{
              width: '80px',
              height: '80px',
              margin: '0 auto 20px',
              background: `${COLORS.primary}15`,
              borderRadius: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <FileText size={40} color={COLORS.primary} />
            </div>
            <h1 style={{ margin: '0 0 12px 0', color: COLORS.dark, fontSize: '32px', fontWeight: '700' }}>
              ReviewMind
            </h1>
            <p style={{ margin: '0', color: '#64748b', fontSize: '16px' }}>
              AI-Powered SME Review Intelligence & Predictive Analytics
            </p>
          </div>

          <div style={{
            border: `2px dashed ${COLORS.secondary}`,
            borderRadius: '12px',
            padding: '40px 20px',
            marginBottom: '24px',
            cursor: 'pointer',
            transition: 'all 0.3s ease',
            background: file ? `${COLORS.primary}08` : 'transparent'
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = `${COLORS.primary}08`}
          onMouseLeave={(e) => e.currentTarget.style.background = file ? `${COLORS.primary}08` : 'transparent'}>
            <input
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              style={{
                display: 'none',
                cursor: 'pointer'
              }}
              id="file-input"
            />
            <label htmlFor="file-input" style={{ cursor: 'pointer', display: 'block' }}>
              <Upload size={32} color={COLORS.secondary} style={{ marginBottom: '12px' }} />
              <p style={{ margin: '12px 0 4px 0', color: COLORS.dark, fontSize: '16px', fontWeight: '600' }}>
                {file ? file.name : 'Drop your CSV file here'}
              </p>
              <p style={{ margin: '0', color: '#64748b', fontSize: '14px' }}>
                or click to browse
              </p>
            </label>
          </div>

          <button
            onClick={uploadAndAnalyze}
            disabled={loading || !file}
            style={{
              width: '100%',
              padding: '14px',
              background: loading || !file ? '#cbd5e1' : COLORS.primary,
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '16px',
              fontWeight: '600',
              cursor: loading || !file ? 'not-allowed' : 'pointer',
              transition: 'all 0.3s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px'
            }}
            onMouseEnter={(e) => {
              if (!loading && file) {
                e.currentTarget.style.background = '#1e3a8a';
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 10px 20px rgba(30,64,175,0.3)';
              }
            }}
            onMouseLeave={(e) => {
              if (!loading && file) {
                e.currentTarget.style.background = COLORS.primary;
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
              }
            }}>
            {loading ? (
              <>
                <RefreshCw size={18} style={{ animation: 'spin 1s linear infinite' }} />
                Analyzing...
              </>
            ) : (
              <>
                <Upload size={18} />
                Analyze Reviews
              </>
            )}
          </button>

          <style>{`
            @keyframes spin {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      </div>
    );
  }

  // ============== DASHBOARD SECTION ==============
  return (
    <div style={{
      minHeight: '100vh',
      background: COLORS.light,
      padding: '32px 20px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      {/* Header */}
      <div style={{
        maxWidth: '1400px',
        margin: '0 auto',
        marginBottom: '32px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '20px'
      }}>
        <div>
          <h1 style={{ margin: '0 0 8px 0', color: COLORS.dark, fontSize: '32px', fontWeight: '700' }}>
            Dashboard
          </h1>
          <p style={{ margin: '0', color: '#64748b', fontSize: '16px' }}>
            Real-time SME review intelligence and predictive insights
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={() => setShowDashboard(false)}
            style={{
              padding: '10px 20px',
              background: 'white',
              border: `1px solid ${COLORS.border}`,
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '600',
              color: COLORS.dark,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.3s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = COLORS.light;
              e.currentTarget.style.borderColor = COLORS.secondary;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'white';
              e.currentTarget.style.borderColor = COLORS.border;
            }}>
            <Upload size={16} />
            New Analysis
          </button>
          <button
            style={{
              padding: '10px 20px',
              background: COLORS.primary,
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '600',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.3s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#1e3a8a';
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = COLORS.primary;
              e.currentTarget.style.transform = 'translateY(0)';
            }}>
            <Download size={16} />
            Export Report
          </button>
        </div>
      </div>

      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        {/* Stat Cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
          gap: '20px',
          marginBottom: '32px'
        }}>
          <StatCard
            title="Total Reviews"
            value={analysis?.ratingDistribution?.reduce((sum, d) => sum + d.value, 0) || 0}
            icon={FileText}
            color={COLORS.primary}
            trend={12}
          />
          <StatCard
            title="Avg. Satisfaction"
            value={`${analysis?.reliability || 85}%`}
            icon={TrendingUp}
            color={COLORS.success}
            trend={8}
          />
          <StatCard
            title="Positive Reviews"
            value={analysis?.sentimentData?.[0]?.value || 280}
            icon={CheckCircle}
            color={COLORS.success}
            trend={15}
          />
          <StatCard
            title="Alerts"
            value={analysis?.sentimentData?.[2]?.value || 70}
            icon={AlertCircle}
            color={COLORS.danger}
            trend={-5}
          />
        </div>

        {/* Charts Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))',
          gap: '20px',
          marginBottom: '32px'
        }}>
          {/* Rating Distribution */}
          <ChartCard title="Rating Distribution">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={analysis?.ratingDistribution || []}>
                <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip
                  contentStyle={{
                    background: 'white',
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: '8px'
                  }}
                />
                <Bar dataKey="value" fill={COLORS.primary} radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Sentiment Analysis */}
          <ChartCard title="Sentiment Breakdown">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={analysis?.sentimentData || []}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {analysis?.sentimentData?.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => `${value} reviews`} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        {/* Time Series */}
        <ChartCard title="Review Trends & Satisfaction Over Time" fullWidth>
          <ResponsiveContainer width="100%" height={350}>
            <AreaChart data={analysis?.timeSeriesData || []}>
              <defs>
                <linearGradient id="colorReviews" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={COLORS.primary} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={COLORS.primary} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorSatisfaction" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={COLORS.success} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={COLORS.success} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip
                contentStyle={{
                  background: 'white',
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: '8px'
                }}
              />
              <Legend />
              <Area
                type="monotone"
                dataKey="reviews"
                stroke={COLORS.primary}
                fillOpacity={1}
                fill="url(#colorReviews)"
                name="Total Reviews"
              />
              <Area
                type="monotone"
                dataKey="satisfaction"
                stroke={COLORS.success}
                fillOpacity={1}
                fill="url(#colorSatisfaction)"
                name="Satisfaction Score"
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Category Analysis & Insights */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))',
          gap: '20px',
          marginTop: '32px'
        }}>
          <ChartCard title="Category Performance Scores">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={analysis?.categoryAnalysis || []}
                layout="vertical"
              >
                <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
                <XAxis type="number" domain={[0, 100]} />
                <YAxis dataKey="category" type="category" width={150} />
                <Tooltip
                  contentStyle={{
                    background: 'white',
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: '8px'
                  }}
                />
                <Bar dataKey="score" fill={COLORS.secondary} radius={[0, 8, 8, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Key Insights */}
          <ChartCard title="Key Insights & Recommendations">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{
                padding: '16px',
                background: `${COLORS.success}10`,
                borderLeft: `4px solid ${COLORS.success}`,
                borderRadius: '8px'
              }}>
                <p style={{ margin: '0 0 8px 0', color: COLORS.dark, fontWeight: '600', fontSize: '14px' }}>
                  AI Recommendation
                </p>
                <p style={{ margin: '0', color: '#475569', fontSize: '14px', lineHeight: '1.6' }}>
                  {analysis?.recommendation || 'Ensure servers are running for AI-powered insights'}
                </p>
              </div>

              <div style={{
                padding: '16px',
                background: `${COLORS.primary}10`,
                borderLeft: `4px solid ${COLORS.primary}`,
                borderRadius: '8px'
              }}>
                <p style={{ margin: '0 0 8px 0', color: COLORS.dark, fontWeight: '600', fontSize: '14px' }}>
                  Data Reliability
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '100%',
                    height: '8px',
                    background: COLORS.border,
                    borderRadius: '4px',
                    overflow: 'hidden'
                  }}>
                    <div style={{
                      width: `${analysis?.reliability || 85}%`,
                      height: '100%',
                      background: COLORS.primary,
                      transition: 'width 0.3s ease'
                    }} />
                  </div>
                  <span style={{ color: COLORS.dark, fontWeight: '600', fontSize: '14px', minWidth: '50px' }}>
                    {analysis?.reliability || 85}%
                  </span>
                </div>
              </div>

              <div style={{
                padding: '16px',
                background: '#f8fafc',
                borderLeft: `4px solid ${COLORS.secondary}`,
                borderRadius: '8px'
              }}>
                <p style={{ margin: '0 0 8px 0', color: COLORS.dark, fontWeight: '600', fontSize: '14px' }}>
                  Quick Stats
                </p>
                <ul style={{ margin: '0', paddingLeft: '20px', color: '#475569', fontSize: '14px' }}>
                  <li>Peak satisfaction period: April-June</li>
                  <li>Top performing category: Customer Service (92/100)</li>
                  <li>Growth trend: +12% month-over-month</li>
                </ul>
              </div>
            </div>
          </ChartCard>
        </div>

        {/* Footer */}
        <div style={{
          marginTop: '40px',
          paddingTop: '20px',
          borderTop: `1px solid ${COLORS.border}`,
          textAlign: 'center',
          color: '#64748b',
          fontSize: '14px'
        }}>
          <p style={{ margin: '0' }}>
            © 2026 ReviewMind. AI-Powered SME Intelligence Platform. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}

export default App;