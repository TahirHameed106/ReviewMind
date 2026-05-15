const axios = require('axios');
require('dotenv').config();

async function test() {
  console.log('Testing Groq with llama-3.3-70b-versatile...');
  try {
    const res = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: 'Say "Groq works!" in 3 words' }],
      max_tokens: 20
    }, {
      headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` }
    });
    console.log('✅ Groq works:', res.data.choices[0].message.content);
  } catch(e) {
    console.log('❌ Groq error:', e.response?.data?.error?.message || e.message);
  }
  
  console.log('\nTesting Gemini with gemini-1.5-pro...');
  try {
    const res = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${process.env.GEMINI_API_KEY}`,
      { contents: [{ parts: [{ text: 'Say "Gemini works!" in 3 words' }] }] }
    );
    console.log('✅ Gemini works:', res.data.candidates[0].content.parts[0].text);
  } catch(e) {
    console.log('❌ Gemini error:', e.response?.data?.error?.message || e.message);
  }
}

test();