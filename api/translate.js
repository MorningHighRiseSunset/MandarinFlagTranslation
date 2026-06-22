// Vercel serverless function: enhanced translator with intent parsing and quoted-phrase handling
// Using DeepL API

const DEEPL_API_KEY = process.env.DEEPL_API_KEY;
const DEEPL_URL = process.env.DEEPL_URL || 'https://api-free.deepl.com/v2/translate';
const path = require('path');

// Load language aliases shipped with the site (falls back gracefully)
let languageAliases = {};
try {
  // try a few likely locations for the shipped language_aliases.json depending on where this file lives
  // 1) when this file is in api/ -> ../language_aliases.json
  // 2) when this file is in project root -> ./language_aliases.json
  try {
    languageAliases = require(path.join(__dirname, '..', 'language_aliases.json'));
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

async function callDeepLTranslate(q, target, source) {
  const url = DEEPL_URL;
  const payload = {
    text: [String(q)],
    target_lang: target.toUpperCase()
  };
  // Only pass source_lang if it's explicitly provided (DeepL auto-detects otherwise)
  if (source && source !== 'auto' && source !== '') {
    payload.source_lang = source.toUpperCase();
  }

  const apiRes = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `DeepL-Auth-Key ${DEEPL_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!apiRes.ok) {
    let textErr = '';
    try {
      textErr = await apiRes.text();
    } catch (e) {
      textErr = String(e);
    }
    console.log('DeepL failed', { status: apiRes.status, body: textErr.slice(0,2000) });
    const err = new Error('DeepL API error');
    err.status = apiRes.status;
    err.details = textErr;
    throw err;
  }

  const json = await apiRes.json();

  if (json && json.translations && json.translations[0]) {
    return { translatedText: json.translations[0].text };
  }
  const err = new Error('Invalid response from DeepL');
  err.raw = json;
  throw err;
}

module.exports = async function handler(req, res) {
  console.log('translate handler invoked');
  try {
    console.log('Incoming request method:', req.method);
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }
    console.log('Incoming request body (raw):', typeof req.body === 'string' ? req.body.slice(0,1000) : req.body);
    if (!DEEPL_API_KEY) return res.status(500).json({ error: 'Server: DeepL API key not configured' });
    const body = req.body || {};
    console.log('Parsed request body:', { text: body.text ? '[REDACTED]' : undefined, source: body.source, target: body.target });
    const { text, source: userSource, target: userTarget } = body || {};
    if (!text) return res.status(400).json({ error: 'Missing `text` in request body' });

    // Map user language names (from dropdown) to codes (be resilient if mapping fails)
    let sourceCode = null;
    if (userSource) {
      sourceCode = mapLanguageNameToCode(userSource);
      if (!sourceCode) console.log('Could not map source language:', userSource);
    }
    let targetCode = 'zh'; // default to Mandarin for this site
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
      // DeepL auto-detects source language, so we skip explicit detection
      // Just use the text as-is for pattern matching
      englishText = String(text);
    } catch (err) {
      englishText = String(text);
    }

  // Check for alphabet listing requests first
  const alphabetPatterns = [
    // English patterns - more flexible to match without language name
    /(?:show\s+me\s+)?(?:the\s+)?(?:mandarin|chinese)?\s*alphabet/i,
    /(?:show\s+me\s+)?(?:the\s+)?(?:mandarin|chinese)?\s*pinyin/i,
    /list\s+(?:the\s+)?(?:mandarin|chinese)?\s*alphabet/i,
    /list\s+(?:the\s+)?(?:mandarin|chinese)?\s*pinyin/i,
    /what\s+(?:is|'s)\s+(?:the\s+)?(?:mandarin|chinese)?\s*alphabet/i,
    /what\s+(?:is|'s)\s+(?:the\s+)?(?:mandarin|chinese)?\s*pinyin/i,
    // Mandarin patterns
    /(?:中|中文|汉语)?\s*字母/i,
    /(?:中|中文|汉语)?\s*拼音/i,
    /列出\s*(?:中|中文|汉语)?\s*字母/i,
    /列出\s*(?:中|中文|汉语)?\s*拼音/i,
    /(?:中|中文|汉语)?\s*字母表/i
  ];

  for (const p of alphabetPatterns) {
    if (p.test(text) || p.test(englishText)) {
      // Return Mandarin Pinyin alphabet
      const mandarinAlphabet = `Mandarin Pinyin Alphabet (汉语拼音字母表):

Initials (声母):
b p m f d t n l g k h j q x zh ch sh r z c s
y w

Finals (韵母):
a o e i u ü
ai ei ui ao ou iu
ie üe er
an en in un ün
ang eng ing ong

Tones (声调):
1: ā ē ī ō ū ǖ (high level)
2: á é í ó ú ǘ (rising)
3: ǎ ě ǐ ǒ ǔ ǚ (falling-rising)
4: à è ì ò ù ǜ (falling)
5: a e i o u ü (neutral)`;
      return res.status(200).json({ result: mandarinAlphabet, detectedSource: 'en', targetUsed: 'zh' });
    }
  }

  // Multi-language patterns: English, Spanish, French, Mandarin
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
      /qu'est-ce\s+que\s+c'est\s+(.+?)\s+in\s+([a-zA-Zàâäéèêëîïôöùûüœæç\s]+)/i,
      // Mandarin patterns: 这个用英语怎么说, 英语怎么说, etc.
      /(.+?)用(?:英语|英文|英文|英)\s*怎么说/i,
      /(.+?)用(?:中文|汉语|中文|汉)\s*怎么说/i,
      /(?:英语|英文|英)\s*怎么说(.+?)/i,
      /(?:中文|汉语|中文|汉)\s*怎么说(.+?)/i,
      /怎么用(?:英语|英文|英)\s*说(.+?)/i,
      /怎么用(?:中文|汉语|中文|汉)\s*说(.+?)/i
    ];

    let match = null;
    for (const p of patterns) {
      const m = englishText.match(p) || text.match(p);
      if (m) { match = m; break; }
    }

    if (match) {
      const phraseToTranslate = (match[1] || '').trim().replace(/["'«»""‹›]/g, '');
      // If the pattern didn't capture a second group (some patterns may omit it), try heuristics
      const maybeLang = (match[2] || '').trim();
      let extractedTargetCode = null;
      
      // For Mandarin patterns, the target language is embedded in the pattern itself
      // Check if the matched pattern contains language keywords
      const matchedPattern = match.input || text || englishText;
      if (/用(?:英语|英文|英)\s*怎么说|怎么用(?:英语|英文|英)\s*说|(?:英语|英文|英)\s*怎么说/.test(matchedPattern)) {
        extractedTargetCode = 'en'; // English
      } else if (/用(?:中文|汉语|汉)\s*怎么说|怎么用(?:中文|汉语|汉)\s*说|(?:中文|汉语|汉)\s*怎么说/.test(matchedPattern)) {
        extractedTargetCode = 'zh'; // Mandarin
      } else if (maybeLang) {
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
          // Detect source language from the phrase to translate if not provided
          let detectedPhraseSource = sourceCode;
          if (!detectedPhraseSource) {
            // Simple heuristic: if phrase contains Chinese characters, it's likely Mandarin
            if (/[\u4e00-\u9fff]/.test(phraseToTranslate)) {
              detectedPhraseSource = 'zh';
            } else if (/[a-zA-Z]/.test(phraseToTranslate)) {
              detectedPhraseSource = 'en';
            }
          }
          
          // Check for redundant same-language request
          if (detectedPhraseSource && detectedPhraseSource === extractedTargetCode) {
            // Return a helpful message instead of redundant translation
            const redundantMsg = detectedPhraseSource === 'zh' 
              ? '这句话已经是中文了，不需要翻译。' 
              : 'This is already in English, no translation needed.';
            return res.status(200).json({ result: redundantMsg, detectedSource: detectedPhraseSource, targetUsed: extractedTargetCode });
          }
          
          // Only call DeepL if we have a valid source code to translate FROM
          // If sourceCode is not available or null, fall through to fallback
          if (detectedPhraseSource && detectedPhraseSource !== extractedTargetCode) {
            const translated = await callDeepLTranslate(phraseToTranslate || text, extractedTargetCode, detectedPhraseSource);
            // Return only the translated phrase as the direct answer and include detected/source info
            return res.status(200).json({ result: translated.translatedText, detectedSource: detectedPhraseSource, targetUsed: extractedTargetCode });
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
      console.log('Calling DeepL for fallback', { text: text.slice(0,200), targetCode, sourceCode });
      const translated = await callDeepLTranslate(text, targetCode, sourceCode);
      return res.status(200).json({ result: translated.translatedText, detectedSource: detectedSource, targetUsed: targetCode });
    } catch (err) {
      return res.status(502).json({ error: 'Translation provider error', details: err.details || String(err) });
    }

  } catch (err) {
    console.error('Unhandled error in translate handler:', err);
    const errorDetails = err && err.stack ? err.stack : String(err);
    return res.status(500).json({ error: 'Server error', details: errorDetails });
  }
};
