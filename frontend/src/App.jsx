import React, { useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { AlertCircle, TrendingDown, Package } from 'lucide-react';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042'];

function App() {
  const [analysis, setAnalysis] = useState(null);

  // This calls your Node.js "Bridge" we discussed
  const runAnalysis = async () => {
    // Placeholder for the actual fetch call to your Node.js backend
    const mockData = {
      clusters: [{ name: 'Delivery', value: 72 }, { name: 'Quality', value: 18 }, { name: 'Price', value: 10 }],
      recommendation: "Switching to a secondary courier is advised for Daraz orders."
    };
    setAnalysis(mockData);
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h1>ReviewMind SME Dashboard</h1>
      <button onClick={runAnalysis} style={{ padding: '10px 20px', cursor: 'pointer' }}>
        Run AI Analysis
      </button>

      {analysis && (
        <div style={{ display: 'flex', gap: '20px', marginTop: '20px' }}>
          {/* K-Means Cluster Visualization [cite: 436, 465] */}
          <div style={{ flex: 1, border: '1px solid #ddd', padding: '15px' }}>
            <h3>Complaint Clusters (K-Means)</h3>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={analysis.clusters} dataKey="value" nameKey="name" label>
                  {analysis.clusters.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Gemini AI Recommendation Card [cite: 342, 393, 500] */}
          <div style={{ flex: 1, border: '1px solid #ddd', padding: '15px', backgroundColor: '#f9f9f9' }}>
            <h3>AI Strategy Report</h3>
            <div style={{ display: 'flex', alignItems: 'center', color: '#d32f2f' }}>
              <AlertCircle size={20} />
              <strong style={{ marginLeft: '10px' }}>Priority: High</strong>
            </div>
            <p style={{ marginTop: '10px', lineHeight: '1.5' }}>{analysis.recommendation}</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;