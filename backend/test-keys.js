const axios = require('axios');
require('dotenv').config();

async function test() {
  console.log('Testing Groq...');
  try {
    const res = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: 'Say OK' }],
      max_tokens: 5
    }, {
      headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` }
    });
    console.log('✅ Groq works:', res.data.choices[0].message.content);
  } catch(e) {
    console.log('❌ Groq error:', e.response?.data?.error?.message || e.message);
  }

  console.log('\nTesting Gemini...');
  try {
    const res = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      { contents: [{ parts: [{ text: 'Say OK' }] }] }
    );
    console.log('✅ Gemini works:', res.data.candidates[0].content.parts[0].text);
  } catch(e) {
    console.log('❌ Gemini error:', e.response?.data?.error?.message || e.message);
  }
}

test();