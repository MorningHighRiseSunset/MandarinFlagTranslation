// Netlify function for Mandarin TTS using Google Translate TTS
exports.handler = async (event, context) => {
  try {
    const queryParams = event.queryStringParameters || {};
    const text = queryParams.text || queryParams.q || '';

    if (!text) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing text parameter' })
      };
    }

    // Encode the text
    const encodedText = encodeURIComponent(text);

    // Google Translate TTS URL for Mandarin
    const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=zh-CN&client=tw-ob&q=${encodedText}`;

    // Fetch the audio from Google
    const response = await fetch(ttsUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    if (!response.ok) {
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: 'TTS service error' })
      };
    }

    // Get the audio buffer
    const audioBuffer = await response.arrayBuffer();

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'public, max-age=3600' // Cache for 1 hour
      },
      body: Buffer.from(audioBuffer).toString('base64'),
      isBase64Encoded: true
    };

  } catch (err) {
    console.error('TTS error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Server error', details: String(err) })
    };
  }
};