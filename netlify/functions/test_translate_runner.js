// Test runner for translate.js - stubs Google Translate API via global.fetch
// Run with: node netlify/functions/test_translate_runner.js

process.env.GOOGLE_API_KEY = 'DUMMY_KEY_FOR_TEST';

// Provide a simple fetch stub to simulate Google Translate API responses
global.fetch = async function(url, opts) {
  const body = JSON.parse(opts.body || '{}');
  const q = body.q || body.q || '';

  // If this is a detect call, simulate the Google Detect API response shape
  if (typeof url === 'string' && url.indexOf('/detect') !== -1) {
    // Heuristic: if the text contains Spanish markers or 'lo que sea', return 'es'
    let detected = 'en';
    if (/¿|\bqué\b|\blo que sea\b|\bque\b/i.test(q)) detected = 'es';
    if (/你好|中文/.test(q)) detected = 'zh';
    if (/नमस्ते|हिंदी/.test(q)) detected = 'hi';
    if (/bonjour|comment/.test(q)) detected = 'fr';
    if (/xin chào|viết|tiếng việt/i.test(q)) detected = 'vi';

    const json = { data: { detections: [ [ { language: detected } ] ] } };
    return {
      ok: true,
      status: 200,
      json: async () => json,
      text: async () => JSON.stringify(json)
    };
  }

  // Fallback: simulate translate API
  // If q includes "lo que sea" translate to "whatever"
  let translated = 'TRANSLATED:' + q;
  if (/lo que sea/i.test(q) || /whatever/i.test(q)) {
    translated = 'whatever';
  }
  const json = { data: { translations: [ { translatedText: translated } ] } };
  return {
    ok: true,
    status: 200,
    json: async () => json,
    text: async () => JSON.stringify(json)
  };
};

const path = require('path');
const fn = require(path.join(__dirname, 'translate.js'));

async function runTest(inputText) {
  const event = { body: JSON.stringify({ text: inputText }) };
  const res = await fn.handler(event);
  console.log('STATUS:', res.statusCode);
  try {
    console.log('BODY:', JSON.parse(res.body));
  } catch (e) {
    console.log('BODY (raw):', res.body);
  }
}

(async function(){
  console.log('Test 1: Spanish "¿Qué significa lo que sea en inglés?"');
  await runTest('¿Qué significa lo que sea en inglés?');

  console.log('\nTest 2: Spanish with quotes "¿Qué quiere decir \"lo que sea\" en inglés?"');
  await runTest('¿Qué quiere decir "lo que sea" en inglés?');

  console.log('\nTest 3: English "How do you say \"lo que sea\" in English?" (edge)');
  await runTest('How do you say "lo que sea" in English?');

  console.log('\nTest 4: User input "¿Cómo se dice noche en español?"');
  await runTest('¿Cómo se dice noche en español?');

  console.log('\nTest 5: User input "como se dice noche en espanol" (no accents)');
  await runTest('como se dice noche en espanol');
})();
