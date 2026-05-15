const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

class PDFGenerator {
  constructor() {
    this.reportsDir = path.join(__dirname, '../uploads/reports');
    if (!fs.existsSync(this.reportsDir)) {
      fs.mkdirSync(this.reportsDir, { recursive: true });
    }
  }

  async generateReport(analysisData) {
    return new Promise((resolve, reject) => {
      try {
        console.log('[PDF] Generating professional report...');

        // Extract data
        let pieData = analysisData?.pieData || analysisData?.data?.pieData || [];
        const positive = Number(pieData.find(p => p.name === 'Positive')?.value) || 0;
        const neutral = Number(pieData.find(p => p.name === 'Neutral')?.value) || 0;
        const negative = Number(pieData.find(p => p.name === 'Negative')?.value) || 0;
        const total = positive + neutral + negative;
        
        if (total <= 0) throw new Error('No valid data');

        const positivePct = ((positive / total) * 100).toFixed(1);
        const neutralPct = ((neutral / total) * 100).toFixed(1);
        const negativePct = ((negative / total) * 100).toFixed(1);
        const avgRating = ((positive * 5 + neutral * 3 + negative * 1) / total).toFixed(1);
        const sentimentScore = Math.round((positive - negative) / total * 50 + 50);

        // Get complaints if available
        const complaints = analysisData?.complaints || [];
        
        const filename = `report_${Date.now()}.pdf`;
        const filepath = path.join(this.reportsDir, filename);

        const doc = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true });
        const stream = fs.createWriteStream(filepath);
        doc.pipe(stream);

        // ============ PAGE 1 ============
        
        // Header with gradient effect
        doc.fillColor('#1a237e').font('Helvetica-Bold').fontSize(28).text('REVIEWMIND', { align: 'center' });
        doc.fontSize(12).fillColor('#546e7a').font('Helvetica').text('Customer Intelligence Report', { align: 'center' });
        doc.fontSize(9).fillColor('#78909c').text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });
        doc.moveDown();
        doc.moveTo(50, doc.y).lineTo(550, doc.y).strokeColor('#1a237e').lineWidth(2).stroke();
        doc.moveDown(2);

        // Executive Summary
        doc.font('Helvetica-Bold').fontSize(18).fillColor('#1a237e').text('Executive Summary');
        doc.moveDown(0.5);
        doc.font('Helvetica').fontSize(11).fillColor('#37474f');
        doc.text(`This report analyzes ${total.toLocaleString()} customer reviews. Overall sentiment is ${positivePct}% positive and ${negativePct}% negative with an average rating of ${avgRating}/5.0 stars.`, { align: 'left', width: 470 });
        doc.moveDown(2);

        // Key Metrics Cards - Professional Design
        const cardY = doc.y;
        
        // Card 1
        doc.fillColor('#e3f2fd').rect(50, cardY, 150, 70).fill();
        doc.fillColor('#1565c0').fontSize(8).font('Helvetica-Bold').text('TOTAL REVIEWS', 60, cardY + 10);
        doc.fontSize(24).font('Helvetica-Bold').fillColor('#0d47a1').text(total.toLocaleString(), 60, cardY + 32);
        
        // Card 2
        doc.fillColor('#e8f5e9').rect(210, cardY, 150, 70).fill();
        doc.fillColor('#2e7d32').fontSize(8).font('Helvetica-Bold').text('AVERAGE RATING', 220, cardY + 10);
        doc.fontSize(24).font('Helvetica-Bold').fillColor('#1b5e20').text(`${avgRating}/5.0`, 220, cardY + 32);
        
        // Card 3
        doc.fillColor('#fff3e0').rect(370, cardY, 150, 70).fill();
        doc.fillColor('#e65100').fontSize(8).font('Helvetica-Bold').text('SENTIMENT SCORE', 380, cardY + 10);
        doc.fontSize(24).font('Helvetica-Bold').fillColor('#bf360c').text(`${sentimentScore}/100`, 380, cardY + 32);
        
        doc.moveDown(6.5);

        // ============ PIE CHART ============
        doc.font('Helvetica-Bold').fontSize(16).fillColor('#1a237e').text('Sentiment Distribution', { underline: true });
        doc.moveDown(1);

        // Draw Pie Chart
        const centerX = 200;
        const centerY = doc.y + 100;
        const radius = 80;
        
        const data = [
          { name: 'Positive', value: positive, color: '#4caf50' },
          { name: 'Neutral', value: neutral, color: '#ff9800' },
          { name: 'Negative', value: negative, color: '#f44336' }
        ].filter(d => d.value > 0);
        
        let startAngle = -Math.PI / 2;
        data.forEach(item => {
          const angle = (item.value / total) * Math.PI * 2;
          const endAngle = startAngle + angle;
          
          const startX = centerX + Math.cos(startAngle) * radius;
          const startY = centerY + Math.sin(startAngle) * radius;
          const endX = centerX + Math.cos(endAngle) * radius;
          const endY = centerY + Math.sin(endAngle) * radius;
          const largeArc = angle > Math.PI ? 1 : 0;
          
          doc.fillColor(item.color);
          doc.path(`M ${centerX} ${centerY} L ${startX} ${startY} A ${radius} ${radius} 0 ${largeArc} 1 ${endX} ${endY} Z`).fill();
          startAngle = endAngle;
        });
        
        // Pie Chart Legend
        const legendX = 340;
        const legendY = centerY - 60;
        doc.fillColor('#4caf50').rect(legendX, legendY, 12, 12).fill();
        doc.fillColor('#37474f').fontSize(10).text(`Positive: ${positive.toLocaleString()} (${positivePct}%)`, legendX + 18, legendY);
        
        doc.fillColor('#ff9800').rect(legendX, legendY + 25, 12, 12).fill();
        doc.fillColor('#37474f').fontSize(10).text(`Neutral: ${neutral.toLocaleString()} (${neutralPct}%)`, legendX + 18, legendY + 25);
        
        doc.fillColor('#f44336').rect(legendX, legendY + 50, 12, 12).fill();
        doc.fillColor('#37474f').fontSize(10).text(`Negative: ${negative.toLocaleString()} (${negativePct}%)`, legendX + 18, legendY + 50);
        
        doc.moveDown(11);

        // ============ BAR CHART ============
        doc.font('Helvetica-Bold').fontSize(16).fillColor('#1a237e').text('Rating Breakdown', { underline: true });
        doc.moveDown(1);

        const chartY = doc.y;
        const chartWidth = 400;
        const maxValue = Math.max(positive, neutral, negative);
        
        // Positive Bar
        const posHeight = (positive / maxValue) * 100;
        doc.fillColor('#4caf50').rect(100, chartY + 100 - posHeight, 40, posHeight).fill();
        doc.fillColor('#37474f').fontSize(10).text('Positive', 105, chartY + 115);
        doc.text(`${positivePct}%`, 110, chartY + 100 - posHeight - 15);
        
        // Neutral Bar
        const neuHeight = (neutral / maxValue) * 100;
        doc.fillColor('#ff9800').rect(200, chartY + 100 - neuHeight, 40, neuHeight).fill();
        doc.fillColor('#37474f').fontSize(10).text('Neutral', 208, chartY + 115);
        doc.text(`${neutralPct}%`, 210, chartY + 100 - neuHeight - 15);
        
        // Negative Bar
        const negHeight = (negative / maxValue) * 100;
        doc.fillColor('#f44336').rect(300, chartY + 100 - negHeight, 40, negHeight).fill();
        doc.fillColor('#37474f').fontSize(10).text('Negative', 305, chartY + 115);
        doc.text(`${negativePct}%`, 310, chartY + 100 - negHeight - 15);
        
        doc.moveDown(7);

        // ============ DETAILED TABLE ============
        const tableY = doc.y;
        doc.fillColor('#1a237e').rect(50, tableY, 500, 28).fill();
        doc.fillColor('white').fontSize(10).font('Helvetica-Bold');
        doc.text('SENTIMENT', 65, tableY + 9);
        doc.text('COUNT', 200, tableY + 9);
        doc.text('PERCENTAGE', 300, tableY + 9);
        doc.text('RECOMMENDATION', 400, tableY + 9);
        
        // Positive Row
        doc.fillColor('#f5f5f5').rect(50, tableY + 28, 500, 25).fill();
        doc.fillColor('#37474f').fontSize(9).font('Helvetica');
        doc.text('🟢 Positive', 65, tableY + 37);
        doc.text(positive.toLocaleString(), 200, tableY + 37);
        doc.text(`${positivePct}%`, 300, tableY + 37);
        doc.text('Leverage for marketing', 400, tableY + 37);
        
        // Neutral Row
        doc.fillColor('white').rect(50, tableY + 53, 500, 25).fill();
        doc.fillColor('#37474f').fontSize(9).font('Helvetica');
        doc.text('🟠 Neutral', 65, tableY + 62);
        doc.text(neutral.toLocaleString(), 200, tableY + 62);
        doc.text(`${neutralPct}%`, 300, tableY + 62);
        doc.text('Follow up to convert', 400, tableY + 62);
        
        // Negative Row
        doc.fillColor('#f5f5f5').rect(50, tableY + 78, 500, 25).fill();
        doc.fillColor('#37474f').fontSize(9).font('Helvetica');
        doc.text('🔴 Negative', 65, tableY + 87);
        doc.text(negative.toLocaleString(), 200, tableY + 87);
        doc.text(`${negativePct}%`, 300, tableY + 87);
        doc.text(negativePct > 25 ? 'Urgent Action Required' : 'Needs Improvement', 400, tableY + 87);
        
        doc.moveDown(5);

        // ============ PAGE 2 ============
        doc.addPage();

        // Complaint Analysis Section
        doc.font('Helvetica-Bold').fontSize(18).fillColor('#1a237e').text('Complaint Analysis', { align: 'center' });
        doc.moveDown(1);

        if (complaints.length > 0) {
          // Complaint Bar Chart
          const complaintY = doc.y;
          const barWidth = 350;
          
          complaints.slice(0, 5).forEach((complaint, idx) => {
            const yPos = complaintY + (idx * 45);
            const barLength = (complaint.value / negative) * barWidth;
            
            doc.fillColor('#37474f').fontSize(10).text(complaint.name, 50, yPos + 5);
            doc.fillColor('#ef5350').rect(200, yPos, Math.max(barLength, 10), 18).fill();
            doc.fillColor('#37474f').fontSize(9).text(`${complaint.value} reviews (${complaint.percentage}%)`, 200 + barLength + 10, yPos + 5);
          });
          
          doc.moveDown(complaints.length * 1.2);
        } else {
          doc.fillColor('#999').fontSize(11).text('No complaint data available. Upload CSV with review text for detailed analysis.', 50, doc.y);
          doc.moveDown(2);
        }

        // ============ AI RECOMMENDATIONS ============
        doc.font('Helvetica-Bold').fontSize(16).fillColor('#1a237e').text('Strategic Recommendations');
        doc.moveDown(0.8);
        
        if (negativePct > 25) {
          doc.fillColor('#ffebee').rect(50, doc.y, 500, 110).fill();
          doc.fillColor('#c62828').fontSize(12).font('Helvetica-Bold').text('⚠️ CRITICAL - Immediate Action Required', 65, doc.y + 12);
          doc.fillColor('#37474f').fontSize(10).font('Helvetica');
          doc.text(`Your data shows ${negativePct}% negative feedback (${negative.toLocaleString()} reviews).`, 65, doc.y + 35);
          doc.text(`This is significantly above the industry benchmark of 15%.`, 65, doc.y + 50);
          doc.moveDown(5);
          
          doc.fontSize(11).font('Helvetica-Bold').fillColor('#1a237e').text('ACTION PLAN:', 65, doc.y);
          doc.fontSize(10).font('Helvetica').fillColor('#37474f');
          doc.text('1️⃣ Export all negative reviews and categorize by complaint type', 75, doc.y + 18);
          doc.text('2️⃣ Identify the #1 complaint category accounting for most negatives', 75, doc.y + 33);
          doc.text('3️⃣ Implement a fix for that specific issue within 5 business days', 75, doc.y + 48);
          doc.text('4️⃣ Respond personally to all 1-2 star reviews with solutions', 75, doc.y + 63);
          doc.text('5️⃣ Re-analyze after 30 days to measure improvement', 75, doc.y + 78);
          
        } else if (negativePct > 15) {
          doc.fillColor('#fff8e1').rect(50, doc.y, 500, 90).fill();
          doc.fillColor('#ef6c00').fontSize(12).font('Helvetica-Bold').text('📊 Moderate Risk - Targeted Improvements Needed', 65, doc.y + 12);
          doc.fillColor('#37474f').fontSize(10).font('Helvetica');
          doc.text(`Your data shows ${negativePct}% negative feedback (${negative.toLocaleString()} reviews).`, 65, doc.y + 35);
          doc.text(`Targeted improvements will help reduce this further.`, 65, doc.y + 50);
          doc.moveDown(5);
          
          doc.fontSize(11).font('Helvetica-Bold').fillColor('#1a237e').text('RECOMMENDATIONS:', 65, doc.y);
          doc.fontSize(10).font('Helvetica').fillColor('#37474f');
          doc.text('1️⃣ Identify top 3 complaint themes from negative reviews', 75, doc.y + 18);
          doc.text('2️⃣ Prioritize fixes for the highest-volume complaint', 75, doc.y + 33);
          doc.text('3️⃣ Leverage positive reviews for marketing content', 75, doc.y + 48);
          doc.text('4️⃣ Monitor sentiment changes weekly', 75, doc.y + 63);
          
        } else {
          doc.fillColor('#e8f5e9').rect(50, doc.y, 500, 80).fill();
          doc.fillColor('#2e7d32').fontSize(12).font('Helvetica-Bold').text('✅ Healthy Sentiment - Maintain Excellence', 65, doc.y + 12);
          doc.fillColor('#37474f').fontSize(10).font('Helvetica');
          doc.text(`Your data shows only ${negativePct}% negative feedback - excellent performance!`, 65, doc.y + 35);
          doc.text(`This puts you above industry benchmarks.`, 65, doc.y + 50);
          doc.moveDown(4.5);
          
          doc.fontSize(11).font('Helvetica-Bold').fillColor('#1a237e').text('OPPORTUNITIES:', 65, doc.y);
          doc.fontSize(10).font('Helvetica').fillColor('#37474f');
          doc.text('1️⃣ Convert positive reviewers into brand advocates', 75, doc.y + 18);
          doc.text('2️⃣ Use positive reviews as social proof on your website', 75, doc.y + 33);
          doc.text('3️⃣ Implement a referral program for satisfied customers', 75, doc.y + 48);
          doc.text('4️⃣ Monitor for any negative trend changes', 75, doc.y + 63);
        }
        
        doc.moveDown(6);

        // ============ BUSINESS IMPACT ============
        doc.font('Helvetica-Bold').fontSize(14).fillColor('#1a237e').text('Business Impact Analysis');
        doc.moveDown(0.5);
        
        doc.fillColor('#f8fafc').rect(50, doc.y, 500, 80).fill();
        doc.fillColor('#334155').fontSize(10).font('Helvetica');
        doc.text(`• Reducing negative reviews from ${negativePct}% to 15% could increase revenue by 15-20%`, 65, doc.y + 12);
        doc.text(`• Each 1-star review affects approximately 30 potential customers`, 65, doc.y + 28);
        doc.text(`• Converting ${neutral.toLocaleString()} neutral customers could add ${Math.round(neutral * 0.3).toLocaleString()} new advocates`, 65, doc.y + 44);
        doc.text(`• Positive reviews (${positive.toLocaleString()}) represent ${positivePct}% of your customer base`, 65, doc.y + 60);

        doc.moveDown(4);

        // ============ FOOTER ============
        const pageCount = doc.bufferedPageRange().count;
        for (let i = 0; i < pageCount; i++) {
          doc.switchToPage(i);
          const pageHeight = doc.page.height;
          doc.fontSize(8).fillColor('#90a4ae');
          doc.text('ReviewMind Intelligence Platform | Confidential Business Report', 50, pageHeight - 30, { align: 'center', width: 500 });
          doc.text(`Page ${i + 1} of ${pageCount} | Generated: ${new Date().toLocaleDateString()}`, 50, pageHeight - 18, { align: 'center', width: 500 });
        }

        doc.end();

        stream.on('finish', () => {
          console.log(`[PDF] Professional report generated: ${filename}`);
          resolve({ success: true, filename, filepath, reportId: `report_${Date.now()}` });
        });

        stream.on('error', reject);

      } catch (error) {
        console.error('[PDF] Error:', error);
        reject(error);
      }
    });
  }
}

module.exports = new PDFGenerator();