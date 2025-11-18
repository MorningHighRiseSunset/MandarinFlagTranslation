// Netlify function: enhanced translator with intent parsing and quoted-phrase handling
// This file was migrated from the local server implementation so behavior is consistent

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
// Allow per-site default target via Netlify env var `SITE_MAIN_TARGET` (e.g. 'fr', 'zh', 'hi', 'en')
const SITE_MAIN_TARGET_RAW = process.env.SITE_MAIN_TARGET || null;
let SITE_MAIN_TARGET = null;
if (SITE_MAIN_TARGET_RAW) {
  SITE_MAIN_TARGET = mapLanguageNameToCode ? mapLanguageNameToCode(SITE_MAIN_TARGET_RAW) : (String(SITE_MAIN_TARGET_RAW).trim().toLowerCase());
}
// Safe debug: log presence of the API key (masked) so we can tell if Netlify injected it
try {
  if (GOOGLE_API_KEY) {
    const masked = `${GOOGLE_API_KEY.slice(0, 6)}...${GOOGLE_API_KEY.slice(-4)}`;
    console.log('GOOGLE_API_KEY present:', true, 'masked:', masked);
  } else {
    console.log('GOOGLE_API_KEY present:', false);
  }
} catch (e) {
  // Defensive: don't let logging errors break the function
  console.log('Error while logging GOOGLE_API_KEY presence', String(e));
}
const path = require('path');

// Load language aliases shipped with the site (falls back gracefully)
let languageAliases = {};
try {
  // try a few likely locations for the shipped language_aliases.json depending on where this file lives
  // 1) when this file is in netlify/functions -> ../../language_aliases.json
  // 2) when this file is in project root -> ./language_aliases.json
  try {
    languageAliases = require(path.join(__dirname, '..', '..', 'language_aliases.json'));
  } catch (e1) {
    try {
      languageAliases = require(path.join(__dirname, 'language_aliases.json'));
    } catch (e2) {
      languageAliases = {};
    }
  }
} catch (e) {
  languageAliases = {};
}

const canonicalToCode = {
  english: 'en',
  spanish: 'es',
  french: 'fr',
  hindi: 'hi',
  mandarin: 'zh',
  vietnamese: 'vi',
  portuguese: 'pt',
  german: 'de',
  italian: 'it',
  arabic: 'ar',
  japanese: 'ja',
  korean: 'ko',
  russian: 'ru'
};

const aliasToCode = {};
Object.keys(languageAliases).forEach((canonical) => {
  const list = languageAliases[canonical] || [];
  const code = canonicalToCode[String(canonical).trim().toLowerCase()] || String(canonical).trim().toLowerCase();
  list.forEach((a) => {
    aliasToCode[String(a).trim().toLowerCase()] = code;
  });
  aliasToCode[String(canonical).trim().toLowerCase()] = code;
});

// Ensure canonical names from our built-in map are available even if the shipped
// language_aliases.json couldn't be loaded into the function bundle.
Object.keys(canonicalToCode).forEach((canonical) => {
  aliasToCode[String(canonical).trim().toLowerCase()] = canonicalToCode[canonical];
});

const fallbackMap = {
  en: 'en', es: 'es', fr: 'fr', hi: 'hi', zh: 'zh', vi: 'vi', pt: 'pt', de: 'de', it: 'it', ar: 'ar', ja: 'ja', ko: 'ko', ru: 'ru'
};

function mapLanguageNameToCode(name) {
  if (!name) return null;
  const n = String(name).trim().toLowerCase();
  if (!n) return null;
  if (aliasToCode[n]) return aliasToCode[n];
  if (fallbackMap[n]) return fallbackMap[n];
  const cleaned = n.replace(/[^a-z]/g, '');
  if (aliasToCode[cleaned]) return aliasToCode[cleaned];
  if (fallbackMap[cleaned]) return fallbackMap[cleaned];
  if (/^[a-z]{2}$/.test(cleaned)) return cleaned;
  return null;
}

// Try resolving language names more broadly (handle Spanish language names like "inglés", "español", etc.)
function resolveLanguageName(name) {
  if (!name) return null;
  // First try the existing resolver
  const fromMap = mapLanguageNameToCode(name);
  if (fromMap) return fromMap;

  // Normalize accents and punctuation, e.g., "inglés" -> "ingles"
  let cleaned = String(name).trim().toLowerCase();
  try {
    cleaned = cleaned.normalize('NFD').replace(/[\u0000-\u036f]/g, '').replace(/[^a-z\s]/g, '');
  } catch (e) {
    cleaned = cleaned.replace(/[^a-z\s]/g, '');
  }

  // Common Spanish names -> ISO codes
  const spanishNameMap = {
    ingles: 'en', ingleses: 'en', inglese: 'en',
    espanol: 'es', espanola: 'es', espanoles: 'es', espanol: 'es', espanol_: 'es',
    frances: 'fr', franceses: 'fr',
    aleman: 'de', alemanes: 'de',
    italiano: 'it', italianos: 'it',
    portugues: 'pt', portuguesas: 'pt', portugues: 'pt',
    japones: 'ja', japoneses: 'ja',
    japonesa: 'ja',
    chino: 'zh', china: 'zh', chinos: 'zh',
    mandarin: 'zh', mandarines: 'zh',
    ruso: 'ru', rusos: 'ru',
    arabe: 'ar', arabes: 'ar',
    coreano: 'ko', coreanos: 'ko',
    vietnamita: 'vi', vietnamitas: 'vi',
    hindi: 'hi', hindues: 'hi'
  };

  if (spanishNameMap[cleaned]) return spanishNameMap[cleaned];

  // Try again against aliasToCode and fallbackMap with cleaned value
  if (aliasToCode[cleaned]) return aliasToCode[cleaned];
  if (fallbackMap[cleaned]) return fallbackMap[cleaned];

  return null;
}

async function callGoogleDetect(q) {
  const url = `https://translation.googleapis.com/language/translate/v2/detect?key=${GOOGLE_API_KEY}`;
  const payload = { q: String(q) };
  const apiRes = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!apiRes.ok) {
    // Log Google Detect response for debugging (do not log API key)
    let textErr = '';
    try {
      textErr = await apiRes.text();
    } catch (e) {
      textErr = String(e);
    }
    console.log('Google Detect failed', { status: apiRes.status, body: textErr.slice(0,2000) });
    const err = new Error('Google detect error');
    err.status = apiRes.status;
    err.details = textErr;
    throw err;
  }
  const json = await apiRes.json();
  if (json && json.data && json.data.detections && json.data.detections[0] && json.data.detections[0][0]) {
    return json.data.detections[0][0].language;
  }
  throw new Error('Invalid response from Google Detect');
}

async function callGoogleTranslate(q, target, source) {
  const url = `https://translation.googleapis.com/language/translate/v2?key=${GOOGLE_API_KEY}`;
  const payload = { q: String(q), target: target, format: 'text' };
  if (source) payload.source = source;


  const apiRes = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!apiRes.ok) {
    // Log Google Translate response for debugging (trim large bodies)
    let textErr = '';
    try {
      textErr = await apiRes.text();
    } catch (e) {
      textErr = String(e);
    }
    console.log('Google Translate failed', { status: apiRes.status, body: textErr.slice(0,2000) });
    const err = new Error('Google API error');
    err.status = apiRes.status;
    err.details = textErr;
    throw err;
  }

  const json = await apiRes.json();

  if (json && json.data && json.data.translations && json.data.translations[0]) {
    return json.data.translations[0];
  }
  const err = new Error('Invalid response from Google Translate');
  err.raw = json;
  throw err;
}

exports.handler = async function(event) {
  console.log('translate handler invoked');
  try {
    console.log('Incoming event body (raw):', typeof event.body === 'string' ? event.body.slice(0,1000) : event.body);
    if (!GOOGLE_API_KEY) return { statusCode: 500, body: JSON.stringify({ error: 'Server: API key not configured' }) };
    const body = JSON.parse(event.body || '{}');
    console.log('Parsed request body:', { text: body.text ? '[REDACTED]' : undefined, source: body.source, target: body.target });
    const { text, source: userSource, target: userTarget } = body || {};
    if (!text) return { statusCode: 400, body: JSON.stringify({ error: 'Missing `text` in request body' }) };

    // Map user language names (from dropdown) to codes (be resilient if mapping fails)
    let sourceCode = null;
    if (userSource) {
      sourceCode = mapLanguageNameToCode(userSource);
      if (!sourceCode) console.log('Could not map source language:', userSource);
    }
    // default target: prefer SITE_MAIN_TARGET (set per Netlify site), otherwise fall back to Spanish
    let targetCode = SITE_MAIN_TARGET || 'es';
     if (userTarget) {
       const mapped = mapLanguageNameToCode(userTarget);
       if (mapped) {
         targetCode = mapped;
       } else {
         console.log('Could not map target language:', userTarget, 'falling back to', targetCode);
       }
     }    // Translate user's input to English to parse intent (skip if already English)
    // Debug: log resolved language codes
    console.log('Resolved language codes', { sourceCode, targetCode });
    let englishText;
  // Track detection/used target information to return to client
  let detectedSource = sourceCode || null;
  let usedTarget = targetCode || null;
    try {
      // If we don't know the source language, try to detect it using Google Detect
      if (!sourceCode) {
        try {
          const detected = await callGoogleDetect(text);
          if (detected) {
            sourceCode = detected;
            console.log('Detected source language:', sourceCode);
            // Auto-map detected source to a sensible target if user didn't supply one
            // Requirements: spanish -> english; french/hindi/mandarin/vietnamese -> spanish
            if (!userTarget) {
              if (sourceCode === 'es') targetCode = 'en';
              else if (['fr', 'hi', 'zh', 'vi'].includes(sourceCode)) targetCode = 'es';
            }
            detectedSource = sourceCode;
            usedTarget = targetCode;
          }
        } catch (e) {
          console.log('Language detection failed, continuing without it', String(e));
        }
      }

      if (sourceCode && sourceCode !== 'en') {
        const t = await callGoogleTranslate(text, 'en', sourceCode);
        englishText = t.translatedText || String(text);
      } else {
        englishText = String(text);
      }
    } catch (err) {
      englishText = String(text);
    }

  // Multi-language patterns: English, Spanish, French
  // These patterns capture two groups: (1) phrase to translate, (2) language name
  const patterns = [
      // English patterns
      /how\s+(?:do\s+i|do\s+you)\s+say\s+(.+?)\s+in\s+([a-zA-Z\u00C0-\u024F\s]+)/i,
      /how\s+to\s+say\s+(.+?)\s+in\s+([a-zA-Z\u00C0-\u024F\s]+)/i,
      /what\s+is\s+(.+?)\s+in\s+([a-zA-Z\u00C0-\u024F\s]+)/i,
      /(?:can\s+you\s+)?translate\s+(.+?)\s+(?:to|into)\s+([a-zA-Z\u00C0-\u024F\s]+)/i,
      /how\s+would\s+i\s+say\s+(.+?)\s+in\s+([a-zA-Z\u00C0-\u024F\s]+)/i,
      /how\s+do\s+i\s+say\s+(.+?)\s+in\s+([a-zA-Z\u00C0-\u024F\s]+)/i,
  // Spanish patterns: ¿Cómo se dice X en Y?
  /¿?\s*cómo\s+se\s+dice\s+(.+?)\s+en\s+([a-záéíóúüñ\s]+)\s*\??/i,
  /¿?\s*qué\s+significa\s+(.+?)\s+en\s+([a-záéíóúüñ\s]+)\s*\??/i,
  /¿?\s*qué\s+quiere\s+decir\s+(.+?)\s+en\s+([a-záéíóúüñ\s]+)\s*\??/i,
  /¿?\s*qué\s+quiere\s+decir\s+(.+?)\s*\??/i,
      // French patterns: Comment dit-on X en Y?
      /comment\s+(?:dit|on\s+dit)\s+(.+?)\s+en\s+([a-zA-Zàâäéèêëîïôöùûüœæç\s]+)/i,
      /qu'est-ce\s+que\s+c'est\s+(.+?)\s+en\s+([a-zA-Zàâäéèêëîïôöùûüœæç\s]+)/i
    ];

    let match = null;
    for (const p of patterns) {
      const m = englishText.match(p) || text.match(p);
      if (m) { match = m; break; }
    }

    if (match) {
      const phraseToTranslate = (match[1] || '').trim().replace(/["'«»“”‹›]/g, '');
      // If the pattern didn't capture a second group (some patterns may omit it), try heuristics
      const maybeLang = (match[2] || '').trim();
      let extractedTargetCode = null;
      if (maybeLang) {
        extractedTargetCode = resolveLanguageName(maybeLang);
      }

      // If we couldn't determine target language from the question, fallback to user's target or English
      if (!extractedTargetCode) {
        // If the question explicitly mentions "en inglés" or similar, map 'inglés' -> 'en'
        if (/ingles|inglesa|inglés|inglés/i.test(maybeLang || '') || /en\s*ingl(es|és)/i.test(englishText)) {
          extractedTargetCode = 'en';
        } else if (userTarget) {
          const mapped = mapLanguageNameToCode(userTarget);
          if (mapped) extractedTargetCode = mapped;
        }
      }

      if (extractedTargetCode) {
        try {
          // Only call Google Translate if we have a valid source code to translate FROM
          // If sourceCode is not available or null, fall through to fallback
          if (sourceCode && sourceCode !== extractedTargetCode) {
            const translated = await callGoogleTranslate(phraseToTranslate || text, extractedTargetCode, sourceCode);
            // Return only the translated phrase as the direct answer and include detected/source info
            return {
              statusCode: 200,
              body: JSON.stringify({ result: translated.translatedText, detectedSource: detectedSource, targetUsed: extractedTargetCode })
            };
          }
        } catch (err) {
          console.log('Pattern-matched translation failed, falling back to full-text translation', { error: String(err).slice(0, 200) });
          // Fall through to fallback translation on error instead of returning 502
        }
      }
      // else continue to fallback translation
    }

    // Fallback: translate from source to target language using user's preference
    try {
      console.log('Calling Google Translate for fallback', { text: text.slice(0,200), targetCode, sourceCode });
      const translated = await callGoogleTranslate(text, targetCode, sourceCode);
      return {
        statusCode: 200,
        body: JSON.stringify({ result: translated.translatedText, detectedSource: detectedSource, targetUsed: targetCode })
      };
    } catch (err) {
      return { statusCode: 502, body: JSON.stringify({ error: 'Translation provider error', details: err.details || String(err) }) };
    }

  } catch (err) {
    console.error('Unhandled error in translate handler:', err);
    const errorDetails = err && err.stack ? err.stack : String(err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Server error', details: errorDetails }) };
  }
};
