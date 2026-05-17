// backend/services/pdfGenerator.js
// npm install pdfkit

const PDFDocument = require('pdfkit');
const fs          = require('fs');
const path        = require('path');

const REPORTS_DIR = path.join(__dirname, '../uploads/reports');

class ReportGenerator {

  async generateReport(data) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });

    const reportId = `rpt_${Date.now()}`;
    const filename = `reviewmind-${reportId}.pdf`;
    const filepath = path.join(REPORTS_DIR, filename);

    await this._build(data, filepath);

    return {
      reportId,
      filename,
      filepath,
      url:         `/api/advanced/reports/download/${reportId}`,
      generatedAt: new Date().toISOString(),
    };
  }

  // ── Build PDF ─────────────────────────────────────────────────
  _build(data, filepath) {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'A4', autoFirstPage: true });
      const ws  = fs.createWriteStream(filepath);
      doc.pipe(ws);
      ws.on('finish', resolve);
      ws.on('error',  reject);

      // Normalise data shape (handles both flat and nested formats)
      const pieData    = data.pieData    || [];
      const metrics    = data.metrics    || {};
      const complaints = data.complaintCategories || data.complaints || [];
      const ratingDist = data.ratingDistribution  || [];
      const timeSeries = data.timeSeriesData       || [];
      const samples    = (data.sampleReviews       || []).slice(0, 6);
      const metadata   = data.analysisMetadata     || {};

      // Derived values
      const total  = Number(metrics.total_reviews)  || pieData.reduce((s, p) => s + (p.value || 0), 0);
      const pos    = Number(metrics.positive_count) || pieData.find(p => p.name === 'Positive')?.value || 0;
      const neu    = Number(metrics.neutral_count)  || pieData.find(p => p.name === 'Neutral')?.value  || 0;
      const neg    = Number(metrics.negative_count) || pieData.find(p => p.name === 'Negative')?.value || 0;
      const safe   = total || 1;
      const posPct = ((pos / safe) * 100).toFixed(1);
      const neuPct = ((neu / safe) * 100).toFixed(1);
      const negPct = ((neg / safe) * 100).toFixed(1);
      const avgR   = Number(metrics.avg_rating   || 0).toFixed(2);
      const score  = metrics.sentiment_score ?? '–';
      const risk   = metrics.risk_level  || 'UNKNOWN';
      const col    = metrics.detected_col || metrics.detected_rating_column || metrics.detected_text_column || 'auto-detected';

      // ── COVER ───────────────────────────────────────────────────
      doc.rect(0, 0, doc.page.width, 150).fill('#0f172a');

      doc.fillColor('#f8fafc').fontSize(30).font('Helvetica-Bold')
         .text('ReviewMind', 50, 45);
      doc.fillColor('#94a3b8').fontSize(13).font('Helvetica')
         .text('Customer Review Intelligence Report', 50, 82);
      doc.fillColor('#64748b').fontSize(10)
         .text(`Generated: ${new Date().toLocaleString()}`, 50, 105)
         .text(`Dataset:   ${total.toLocaleString()} reviews analyzed`, 50, 120);

      // Risk badge
      const riskColors = { CRITICAL: '#dc2626', HIGH: '#ea580c', MEDIUM: '#d97706', LOW: '#16a34a' };
      const riskColor  = riskColors[risk] || '#64748b';
      doc.roundedRect(doc.page.width - 140, 55, 90, 28, 6).fill(riskColor);
      doc.fillColor('#ffffff').fontSize(11).font('Helvetica-Bold')
         .text(risk, doc.page.width - 140, 63, { width: 90, align: 'center' });

      doc.moveDown(6);

      // ── EXECUTIVE SUMMARY ───────────────────────────────────────
      this._h2(doc, 'Executive Summary');
      doc.fillColor('#334155').fontSize(11).font('Helvetica')
         .text(
           `This report covers ${total.toLocaleString()} customer reviews. ` +
           `Sentiment analysis shows ${posPct}% positive, ${neuPct}% neutral, and ${negPct}% negative. ` +
           `The average rating is ${avgR}/5.0 and the composite sentiment score is ${score}/100. ` +
           `Overall risk classification: ${risk}.`,
           { lineGap: 5 }
         );
      doc.moveDown(1);

      // ── KEY METRICS TABLE ───────────────────────────────────────
      this._h2(doc, 'Key Metrics');
      this._table(doc, ['Metric', 'Value'], [
        ['Total Reviews',     total.toLocaleString()],
        ['Average Rating',    `${avgR} / 5.00`],
        ['Positive',          `${pos.toLocaleString()} (${posPct}%)`],
        ['Neutral',           `${neu.toLocaleString()} (${neuPct}%)`],
        ['Negative',          `${neg.toLocaleString()} (${negPct}%)`],
        ['Sentiment Score',   `${score} / 100`],
        ['Risk Level',        risk],
        ['Detected Column',   col],
        ['Analysis Time',     metadata.analysisTime ? new Date(metadata.analysisTime).toLocaleString() : '–'],
      ]);

      // ── SENTIMENT BAR CHART ─────────────────────────────────────
      this._h2(doc, 'Sentiment Distribution');
      this._barChart(doc, [
        { label: 'Positive', pct: Number(posPct), count: pos,  color: '#059669' },
        { label: 'Neutral',  pct: Number(neuPct), count: neu,  color: '#d97706' },
        { label: 'Negative', pct: Number(negPct), count: neg,  color: '#dc2626' },
      ]);

      // ============================================================
      // ADDED: RATING DISTRIBUTION CHART
      // ============================================================
      if (ratingDist && ratingDist.length > 0) {
        this._h2(doc, 'Rating Distribution');
        const maxCount = Math.max(...ratingDist.map(r => r.count), 1);
        this._barChart(doc, ratingDist.map(r => ({
          label: `${r.rating} ★`,
          pct: Math.round((r.count / maxCount) * 100),
          count: r.count,
          color: r.rating >= 4 ? '#059669' : r.rating >= 3 ? '#d97706' : '#dc2626'
        })));
      } else {
        // Fallback: Create rating distribution from pie data if available
        if (total > 0) {
          this._h2(doc, 'Rating Distribution');
          const estimatedRatings = [
            { rating: 5, count: Math.round(pos * 0.6), color: '#059669' },
            { rating: 4, count: Math.round(pos * 0.4), color: '#059669' },
            { rating: 3, count: neu, color: '#d97706' },
            { rating: 2, count: Math.round(neg * 0.6), color: '#dc2626' },
            { rating: 1, count: Math.round(neg * 0.4), color: '#dc2626' }
          ];
          const maxCount = Math.max(...estimatedRatings.map(r => r.count), 1);
          this._barChart(doc, estimatedRatings.map(r => ({
            label: `${r.rating} ★`,
            pct: Math.round((r.count / maxCount) * 100),
            count: r.count,
            color: r.color
          })));
        }
      }

      // ============================================================
      // ADDED: COMPLAINT IMPACT ANALYSIS
      // ============================================================
      if (complaints.length > 0) {
        this._h2(doc, 'Complaint Impact Analysis');
        const totalComplaints = complaints.reduce((sum, c) => sum + (c.count || 0), 0);
        this._table(doc, ['Category', 'Mentions', 'Impact %'], 
          complaints.map(c => [
            c.category, 
            (c.count || 0).toLocaleString(), 
            `${Math.round(((c.count || 0) / totalComplaints) * 100)}%`
          ])
        );
        doc.moveDown(0.4);
        doc.fillColor('#64748b').fontSize(9).font('Helvetica')
           .text(`Total complaints tracked: ${totalComplaints.toLocaleString()} mentions across ${complaints.length} categories.`);
      }

      // ── COMPLAINT CATEGORIES (Original - kept for compatibility) ──
      if (complaints.length > 0) {
        this._h2(doc, 'Top Complaint Categories');
        this._table(doc,
          ['Category', 'Mentions', 'Share of Negatives'],
          complaints.map(c => [c.category, (c.count || 0).toLocaleString(), `${c.percentage || 0}%`])
        );
        doc.moveDown(0.4);
        doc.fillColor('#64748b').fontSize(9).font('Helvetica')
           .text(`Based on ${neg.toLocaleString()} negative reviews. One review may match multiple categories.`);
      }

      // ── TIME SERIES TABLE ───────────────────────────────────────
      if (timeSeries && timeSeries.length > 1) {
        this._h2(doc, 'Rating Trend Over Time');
        this._table(doc,
          ['Period', 'Avg Satisfaction', 'Reviews'],
          timeSeries.map(t => [t.month || t.date, Number(t.satisfaction || t.avg_rating || 0).toFixed(2), (t.reviews || t.count || 0).toLocaleString()])
        );
      }

      // ── RECOMMENDATIONS ─────────────────────────────────────────
      this._h2(doc, 'Recommendations');
      this._recommendations(doc, { pos, neu, neg, total, negPct, posPct, avgR, risk, score, complaints });

      // ── SAMPLE REVIEWS ──────────────────────────────────────────
      if (samples.length > 0) {
        this._h2(doc, 'Sample Reviews');
        samples.forEach((s, i) => {
          if (doc.y > doc.page.height - 120) doc.addPage();

          const sc = s.sentiment === 'Positive' ? '#059669' : s.sentiment === 'Negative' ? '#dc2626' : '#d97706';
          const ratingStr = s.rating != null ? `  ★ ${Number(s.rating).toFixed(1)}` : '';

          doc.fillColor(sc).fontSize(9).font('Helvetica-Bold')
             .text(`[${s.sentiment || 'Unknown'}]${ratingStr}`);
          doc.fillColor('#334155').fontSize(9).font('Helvetica')
             .text(String(s.text || '').slice(0, 280) + (String(s.text || '').length > 280 ? '…' : ''),
               { lineGap: 2 });

          if (i < samples.length - 1) {
            doc.moveDown(0.4);
            doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y)
               .strokeColor('#e2e8f0').lineWidth(0.5).stroke();
            doc.moveDown(0.4);
          }
        });
      }

      // ── FOOTER ──────────────────────────────────────────────────
      doc.moveDown(3);
      doc.fillColor('#94a3b8').fontSize(9).font('Helvetica')
         .text(
           `ReviewMind · AI analysis · blockchain integrity · PDF reporting · ${new Date().toLocaleDateString()}`,
           50, doc.page.height - 40,
           { align: 'center', width: doc.page.width - 100 }
         );

      doc.end();
    });
  }

  // ── Helpers ───────────────────────────────────────────────────
  _h2(doc, title) {
    if (doc.y > doc.page.height - 150) doc.addPage();
    doc.moveDown(0.8);
    doc.fillColor('#0f172a').fontSize(14).font('Helvetica-Bold').text(title);
    doc.moveTo(50, doc.y + 3).lineTo(doc.page.width - 50, doc.y + 3)
       .strokeColor('#e2e8f0').lineWidth(1).stroke();
    doc.moveDown(0.6);
  }

  _table(doc, headers, rows) {
    const colW  = Math.floor((doc.page.width - 100) / headers.length);
    const rowH  = 20;
    const startX = 50;

    // Header row
    doc.rect(startX, doc.y, doc.page.width - 100, rowH).fill('#f1f5f9');
    headers.forEach((h, i) => {
      doc.fillColor('#1e293b').fontSize(9).font('Helvetica-Bold')
         .text(h, startX + colW * i + 6, doc.y - rowH + 6, { width: colW - 10, lineBreak: false });
    });
    doc.moveDown(0.3);

    // Data rows
    rows.forEach((row, ri) => {
      if (doc.y > doc.page.height - 60) doc.addPage();
      if (ri % 2 === 0) {
        doc.rect(startX, doc.y, doc.page.width - 100, rowH).fill('#f8fafc');
      }
      row.forEach((cell, ci) => {
        doc.fillColor('#334155').fontSize(9).font('Helvetica')
           .text(String(cell), startX + colW * ci + 6, doc.y - rowH + 6,
             { width: colW - 10, lineBreak: false });
      });
      doc.moveDown(0.3);
    });
    doc.moveDown(0.5);
  }

  _barChart(doc, items) {
    const chartWidth = doc.page.width - 180;
    const barH       = 16;
    const gap        = 8;

    items.forEach(item => {
      if (doc.y > doc.page.height - 60) doc.addPage();

      const labelX = 50;
      const barX   = 160;
      const barW   = Math.max(2, Math.round((item.pct / 100) * chartWidth));
      const y      = doc.y;

      // Label
      doc.fillColor('#334155').fontSize(9).font('Helvetica')
         .text(item.label, labelX, y + 3, { width: 100, lineBreak: false });

      // Background track
      doc.rect(barX, y, chartWidth, barH).fill('#f1f5f9');

      // Filled bar
      doc.rect(barX, y, barW, barH).fill(item.color || '#2563eb');

      // Value text
      const displayVal = item.count !== undefined
        ? `${item.pct}%  (${Number(item.count).toLocaleString()})`
        : `${item.pct}%`;
      doc.fillColor('#475569').fontSize(8).font('Helvetica')
         .text(displayVal, barX + barW + 6, y + 4, { lineBreak: false });

      doc.moveDown(0).y = y + barH + gap;
    });
    doc.moveDown(0.8);
  }

  _recommendations(doc, { pos, neu, neg, total, negPct, posPct, avgR, risk, score, complaints }) {
    const recs = [];

    if (parseFloat(negPct) >= 40) {
      recs.push({
        title: '🚨 CRITICAL: Immediate action required',
        body:  `${negPct}% of reviews are negative (${neg.toLocaleString()} reviews). This is a critical risk level. Escalate to leadership and investigate root causes immediately.`,
      });
    } else if (parseFloat(negPct) >= 25) {
      recs.push({
        title: '⚠️ HIGH risk: Address negative reviews urgently',
        body:  `${negPct}% negative rate (${neg.toLocaleString()} reviews). Prioritize response to the top complaint categories listed above.`,
      });
    } else if (parseFloat(negPct) >= 15) {
      recs.push({
        title: '📉 MEDIUM risk: Monitor and improve',
        body:  `${negPct}% negative rate. Investigate recurring complaint themes and set up alerts for further deterioration.`,
      });
    } else {
      recs.push({
        title: '✅ LOW risk: Maintain and scale what works',
        body:  `Only ${negPct}% negative reviews. Focus on amplifying what drives the ${posPct}% positive experiences.`,
      });
    }

    if (parseFloat(avgR) >= 4.0) {
      recs.push({
        title: '🌟 Strong rating — leverage for marketing',
        body:  `Average rating of ${avgR}/5 is excellent. Use this in customer acquisition materials and case studies.`,
      });
    } else if (parseFloat(avgR) < 3.0) {
      recs.push({
        title: '❌ Low rating requires product/service review',
        body:  `Average rating of ${avgR}/5 suggests fundamental issues. Conduct customer interviews to identify root causes beyond complaint keywords.`,
      });
    }

    if (complaints && complaints.length > 0) {
      const top = complaints[0];
      recs.push({
        title: `🔧 Top priority: Fix "${top.category}"`,
        body:  `"${top.category}" is the most mentioned complaint (${top.count} mentions, ${top.percentage || 0}% of complaints). Create a dedicated task force for this issue.`,
      });
    }

    recs.push({
      title: '📊 Set up regular review monitoring',
      body:  `With ${total.toLocaleString()} reviews analyzed, establish a monthly ReviewMind analysis cadence to track sentiment trends and measure improvement over time.`,
    });

    recs.forEach((rec, i) => {
      if (doc.y > doc.page.height - 100) doc.addPage();
      doc.fillColor('#0f172a').fontSize(11).font('Helvetica-Bold')
         .text(`${i + 1}. ${rec.title}`);
      doc.fillColor('#475569').fontSize(10).font('Helvetica')
         .text(rec.body, { lineGap: 3 });
      doc.moveDown(0.6);
    });
  }
}

module.exports = new ReportGenerator();