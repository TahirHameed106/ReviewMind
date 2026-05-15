const axios = require('axios');
require('dotenv').config();

async function testAll() {
  console.log('\n🔍 TESTING ALL SERVICES\n' + '='.repeat(40));

  // 1. Test Groq
  console.log('\n1️⃣ TESTING GROQ...');
  try {
    const groqRes = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: 'Say "OK" in one word' }],
      max_tokens: 5
    }, {
      headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` }
    });
    console.log('✅ GROQ WORKING:', groqRes.data.choices[0].message.content);
  } catch(e) {
    console.log('❌ GROQ FAILED:', e.response?.data?.error?.message || e.message);
  }

  // 2. Test Gemini
  console.log('\n2️⃣ TESTING GEMINI...');
  try {
    const geminiRes = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${process.env.GEMINI_API_KEY}`,
      { contents: [{ parts: [{ text: 'Say "OK"' }] }] }
    );
    console.log('✅ GEMINI WORKING:', geminiRes.data.candidates[0].content.parts[0].text);
  } catch(e) {
    console.log('❌ GEMINI FAILED:', e.response?.data?.error?.message || e.message);
  }

  // 3. Test Python Service
  console.log('\n3️⃣ TESTING PYTHON SERVICE...');
  try {
    const pythonRes = await axios.get('http://localhost:8000/health');
    console.log('✅ PYTHON WORKING:', pythonRes.data);
  } catch(e) {
    console.log('❌ PYTHON FAILED: Is it running? Start with: cd ml_service && python main.py');
  }

  // 4. Test Node Server
  console.log('\n4️⃣ TESTING NODE SERVER...');
  try {
    const nodeRes = await axios.get('http://localhost:3000/health');
    console.log('✅ NODE WORKING:', nodeRes.data);
  } catch(e) {
    console.log('❌ NODE FAILED: Is it running? Start with: node server.js');
  }

  console.log('\n' + '='.repeat(40));
  console.log('✅ TEST COMPLETE\n');
}

testAll();