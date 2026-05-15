# ReviewMind System Testing Guide

## ✅ Pre-Launch Verification Checklist

Before starting the system, verify all dependencies are installed:

```bash
# Check Node.js version (should be 14+)
node --version

# Check npm version (should be 6+)
npm --version

# Check Python version (should be 3.8+)
python --version
```

Expected output:
```
v18.x.x (or higher)
8.x.x (or higher)
Python 3.x.x
```

---

## 🚀 Phase 1: Service Startup & Health Checks

### Step 1: Start Python ML Service

**Terminal 1:**
```bash
cd D:\ReviewMind\ml_service
uvicorn main:app --reload --port 8000
```

**Expected Output:**
```
INFO:     Uvicorn running on http://127.0.0.1:8000
INFO:     Application startup complete
```

**Health Check:**
```bash
curl http://localhost:8000/docs
```
Should show FastAPI Swagger UI in browser.

---

### Step 2: Start Node.js Backend

**Terminal 2:**
```bash
cd D:\ReviewMind\backend
node server.js
```

**Expected Output:**
```
🚀 ReviewMind Gateway running on http://localhost:3000
✅ Database Connection Pool Created (or "DB connection skipped")
✅ All API routes registered
```

**Health Check:**
```bash
curl http://localhost:3000/api/auth/status
```
Should return a response (no 404 error).

---

### Step 3: Start Frontend Dev Server

**Terminal 3:**
```bash
cd D:\ReviewMind\frontend
npm run dev
```

**Expected Output:**
```
  ➜  Local:   http://localhost:5173/
  ➜  press h to show help
```

---

## 📊 Phase 2: Application Testing

### Test 2.1: UI Load

1. Open **http://localhost:5173** in browser
2. Should see ReviewMind upload screen with:
   - Logo and branding
   - File upload area (dashed border)
   - "Analyze Reviews" button
   - Gradient background

**If not working:**
- Check browser console (F12 > Console tab)
- Look for JavaScript errors
- Verify frontend dev server is running

---

### Test 2.2: File Upload & Analysis

1. Prepare test CSV file with format:
   ```
   review_text,rating
   Great product,5
   Not satisfied,2
   Excellent service,5
   Poor quality,1
   ```

2. Click upload area and select your CSV
3. Click "Analyze Reviews"
4. Wait 15-20 seconds for processing

**Expected Result:**
- Loading spinner shows "Analyzing..."
- Dashboard appears with real data
- Stats show correct review count

**If fails:**
- Check backend console for errors
- Verify Python service is running
- Check ML service response: `curl http://localhost:8000/docs`

---

### Test 2.3: Dashboard Interaction

**On Dashboard:**
1. Verify all 4 stat cards show numbers (not NaN or 0)
2. Click sentiment distribution pie chart - should be interactive
3. Click "Blockchain" tab - should load blockchain stats
4. Return to "Dashboard" tab

**Expected:**
- Charts are interactive (hover for tooltips)
- Data matches your uploaded file
- No console errors

---

## 🤖 Phase 3: Feature Testing

### Test 3.1: Chat Feature

1. Click **"Chat"** button (bottom right)
2. Chat window opens with greeting message
3. Try some questions:
   ```
   "How many total reviews do I have?"
   "What's the sentiment distribution?"
   "Give me key insights from the reviews"
   ```

**Expected:**
- Chat responds within 2-5 seconds
- Responses are contextual to your data
- No "chat service not available" errors

**If fails:**
- Check .env has GROQ_API_KEY and GEMINI_API_KEY
- Verify backend console shows no errors
- Check timeout settings (should be 10s)

---

### Test 3.2: Blockchain Verification

1. Click **"🔐 Blockchain"** tab
2. Should see:
   - Total Verified Reviews (number)
   - Chain Blocks (number)
   - Chain Status (✓ VALID or similar)

3. Click **"Verify Chain"** button
4. Should show verification success

**Expected:**
- Chain status shows as VALID
- Numbers match analysis
- No blockchain errors in console

---

### Test 3.3: PDF Report Download

1. Click **"📥 Download PDF Report"** button
2. Browser downloads PDF file
3. Open downloaded PDF

**Expected:**
- File named: `reviewmind_report_[timestamp].pdf`
- PDF opens successfully
- Contains:
  - Analysis data
  - Charts
  - Summary information

**If fails:**
- Verify pdfkit installed: `npm list pdfkit` (in backend)
- Check /uploads/reports directory exists
- Review backend console for PDF generation errors

---

## 🔍 Phase 4: API Testing (Advanced)

### Test API Endpoints Directly

**Test Blockchain Endpoint:**
```bash
curl -X GET http://localhost:3000/api/advanced/blockchain/stats
```

Should return JSON with blockchain stats.

**Test Chat Initialization:**
```bash
curl -X POST http://localhost:3000/api/advanced/chat/conversation \
  -H "Content-Type: application/json" \
  -d '{"analysisContext":{}}'
```

Should return conversationId.

**Test ML Analysis:**
```bash
curl -X POST http://localhost:3000/api/advanced/ml/enhanced-analyze \
  -H "Content-Type: application/json" \
  -d '{
    "reviews":[
      {"text":"Great","rating":5},
      {"text":"Bad","rating":2}
    ]
  }'
```

Should return analysis data.

---

## 📋 Complete Test Scenario

**Full User Journey:**

1. ✅ Open http://localhost:5173
2. ✅ Upload CSV with ~50 reviews
3. ✅ See dashboard populate with real data
4. ✅ Click Blockchain tab, verify chain status
5. ✅ Click Chat, ask 3 questions
6. ✅ Click "Download PDF Report"
7. ✅ Open downloaded PDF
8. ✅ Return to dashboard, click "New Analysis"
9. ✅ Upload different CSV, repeat

---

## 🐛 Troubleshooting by Symptom

### Symptom: "Cannot GET /"
**Solution:** Frontend dev server not running. Start Terminal 3.

### Symptom: "CORS error" in console
**Solution:** Backend not running or CORS not enabled. Restart Terminal 2.

### Symptom: Charts show empty/no data
**Solution:** Analysis failed. Check Python service logs. Try simpler CSV.

### Symptom: Chat responds but not contextual
**Solution:** Analysis data not passed correctly. Check browser console for API errors.

### Symptom: PDF download starts but file is empty
**Solution:** pdfkit not installed. Run `npm install pdfkit` in backend.

### Symptom: All three services running but application is slow
**Solution:** 
- Close other applications
- Check network connectivity
- Verify no other services on ports 3000, 5173, 8000

---

## ✨ Success Indicators

When everything is working correctly:

✅ All three servers show no errors in terminal
✅ Dashboard loads in <5 seconds
✅ Charts render with real data
✅ Chat responds within 2-5 seconds  
✅ PDF downloads successfully
✅ Blockchain shows VALID status
✅ No console errors (F12)
✅ Can upload multiple files and switch between analyses
✅ All buttons are clickable and responsive
✅ UI shows professional design with proper colors

---

## 📞 Getting Help

**If you encounter issues:**

1. **Check the logs:**
   - Browser console: F12 > Console
   - Backend terminal: Look for red error text
   - Frontend terminal: Look for red error text
   - Python terminal: Look for red error text

2. **Verify prerequisites:**
   - All three servers are running
   - No port conflicts
   - CSV file has proper format
   - API keys in .env (if needed)

3. **Try a fresh restart:**
   - Stop all three services (Ctrl+C)
   - Wait 5 seconds
   - Start in order: Python → Backend → Frontend
   - Refresh browser page

4. **Check dependencies:**
   ```bash
   # Backend
   cd backend && npm install
   
   # Frontend  
   cd frontend && npm install
   
   # Python
   cd ml_service && pip install -r requirements.txt
   ```

---

## 📊 Performance Benchmarks

Expected performance metrics:

- **Analysis time** (100 reviews): 5-8 seconds
- **Analysis time** (1000 reviews): 10-15 seconds
- **PDF generation**: 2-3 seconds
- **Chat response**: 2-5 seconds (Groq), 3-8 seconds (Gemini)
- **Dashboard render**: <1 second (after analysis complete)
- **Page load time**: 1-2 seconds
- **Memory usage**: 50-200MB per service

---

**Test Complete!** 🎉

If all tests pass, your ReviewMind system is ready for production use.
