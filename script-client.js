// Client script: auto-detect-as-you-type with optional manual override
// Localized UI strings
const i18n = {
    en: {
        placeholder: "Type a word or phrase...",
        button: "Translate",
        help: "Use short phrases for best results",
        errorServer: "Cannot reach translation server. Make sure it is running.",
        detectedPrefix: "Detected:",
        translatingTo: "Translating to:",
        manualMode: "Manual mode",
        manualSourceLabel: "I speak:",
        manualTargetLabel: "Translate to:",
        autoOption: "Auto-detect"
    },
    es: {
        placeholder: "Escriba una palabra o frase...",
        button: "Traducir",
        help: "Use frases cortas para mejores resultados",
        errorServer: "No se puede acceder al servidor de traducción. Asegúrate de que esté en ejecución.",
        detectedPrefix: "Detectado:",
        translatingTo: "Traduciendo a:",
        manualMode: "Modo manual",
        manualSourceLabel: "Hablo:",
        manualTargetLabel: "Traducir a:",
        autoOption: "Detección automática"
    }
};

// Friendly names for language codes
const codeToFriendly = { en: 'English', es: 'Spanish', fr: 'French', hi: 'Hindi', zh: 'Mandarin', vi: 'Vietnamese' };

// Manual options (values map to server mapping expectations)
const manualOptions = [
    { key: '', label_en: i18n.en.autoOption, label_es: i18n.es.autoOption },
    { key: 'english', label_en: 'English', label_es: 'Inglés' },
    { key: 'spanish', label_en: 'Spanish (Español)', label_es: 'Español' },
    { key: 'french', label_en: 'French (Français)', label_es: 'Francés' },
    { key: 'hindi', label_en: 'Hindi (हिंदी)', label_es: 'Hindi' },
    { key: 'mandarin', label_en: 'Mandarin (中文)', label_es: 'Mandarín' },
    { key: 'vietnamese', label_en: 'Vietnamese (Tiếng Việt)', label_es: 'Vietnamita' }
];

let detectTimer = null;
const DEBOUNCE_MS = 1500; // Increased from 600ms to avoid interrupting the user mid-word

// Voice recognition (Web Speech API) helpers
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition || null;
let recognition = null;
let isRecognizing = false;

function initRecognition() {
    if (!SpeechRecognition) return null;
    try {
        recognition = new SpeechRecognition();
        recognition.lang = (document.documentElement.lang || 'es');
        recognition.interimResults = true;
        recognition.continuous = false;
        recognition.maxAlternatives = 1;

        recognition.onstart = () => {
            isRecognizing = true;
            updateMicButton(true);
        };
        recognition.onend = () => {
            isRecognizing = false;
            updateMicButton(false);
        };
        recognition.onerror = (ev) => {
            console.warn('Speech recognition error', ev);
            isRecognizing = false;
            updateMicButton(false);
        };
        recognition.onresult = (ev) => {
            if (!ev.results || ev.results.length === 0) return;
            // Combine interim/final transcripts
            let interim = '';
            let final = '';
            for (let i = 0; i < ev.results.length; i++) {
                const res = ev.results[i];
                if (res.isFinal) final += res[0].transcript;
                else interim += res[0].transcript;
            }
            const inputEl = document.getElementById('input');
            if (inputEl) {
                inputEl.value = (final || interim).trim();
            }
            if (final && final.trim()) {
                // Final result — trigger translation
                setTimeout(() => startTranslate(), 150);
            }
        };
        return recognition;
    } catch (e) {
        console.warn('Voice init failed', e);
        recognition = null;
        return null;
    }
}

function startRecognition() {
    if (!SpeechRecognition) return;
    if (!recognition) initRecognition();
    try {
        recognition.start();
    } catch (e) {
        console.warn('recognition start error', e);
    }
}

function stopRecognition() {
    if (recognition && isRecognizing) {
        try { recognition.stop(); } catch (e) { console.warn(e); }
    }
}

function toggleRecognition() {
    if (!SpeechRecognition) return;
    if (isRecognizing) stopRecognition(); else startRecognition();
}

function updateMicButton(listening) {
    const btn = document.getElementById('micBtn');
    if (!btn) return;
    btn.setAttribute('aria-pressed', listening ? 'true' : 'false');
    btn.title = listening ? 'Listening... (Escuchando...)' : 'Use voice input (Usar entrada de voz)';
    btn.style.background = listening ? 'rgba(0,102,204,0.12)' : '';
}

function setBusy(busy) {
  const input = document.getElementById('input');
  if (input) input.disabled = !!busy;
}function clearOutputAnimated(el) {
    const letters = Array.from(el.querySelectorAll('.letter'));
    if (letters.length === 0) {
        el.textContent = '';
        return;
    }
    let index = 0;
    const interval = setInterval(() => {
        if (index < letters.length) {
            letters[index].classList.add('pop-out');
            index++;
        } else {
            clearInterval(interval);
            el.textContent = '';
        }
    }, 35);
}

function typeOutputAnimated(el, text) {
    el.innerHTML = '';
    const chars = text.split('');
    chars.forEach((char, index) => {
        const span = document.createElement('span');
        span.className = 'letter';
        span.textContent = char;
        el.appendChild(span);
        setTimeout(() => {
            span.classList.add('pop-in');
        }, index * 28);
    });
    // Speak the result text after animation
    speakText(text);
}

function speakText(text) {
    // Use browser's Web Speech Synthesis API
    if (!text || !window.speechSynthesis) return;
    
    // Cancel any ongoing speech
    window.speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    
    // Try to detect target language for appropriate voice
    const manualToggle = document.getElementById('manualToggle');
    const manualTarget = document.getElementById('manualTarget');
    let targetLang = 'es'; // default to Spanish
    
    if (manualToggle && manualToggle.checked && manualTarget) {
        const targetValue = manualTarget.value;
        // Map manual keys to language codes
        const langMap = {
            'english': 'en',
            'spanish': 'es',
            'french': 'fr',
            'hindi': 'hi',
            'mandarin': 'zh',
            'vietnamese': 'vi'
        };
        targetLang = langMap[targetValue] || 'es';
    }
    
    utterance.lang = targetLang;
    utterance.rate = 0.9; // Slightly slower for clarity
    
    window.speechSynthesis.speak(utterance);
}

function localizeUI() {
    // Use page language to choose locale (default to en)
    const pageLang = (document.documentElement.lang || 'en').slice(0,2).toLowerCase();
    return i18n[pageLang] ? i18n[pageLang] : i18n.en;
}

function populateManualSelects() {
    const locale = localizeUI();
    const src = document.getElementById('manualSource');
    const tgt = document.getElementById('manualTarget');
    if (!src || !tgt) return;
    src.innerHTML = '';
    tgt.innerHTML = '';
    manualOptions.forEach(opt => {
        const o1 = document.createElement('option');
        o1.value = opt.key;
        o1.textContent = locale === i18n.es ? (opt.label_es || opt.label_en) : (opt.label_en || opt.label_es);
        src.appendChild(o1);

        const o2 = document.createElement('option');
        o2.value = opt.key === '' ? 'spanish' : opt.key; // default target options should include spanish first
        o2.textContent = locale === i18n.es ? (opt.label_es || opt.label_en) : (opt.label_en || opt.label_es);
        tgt.appendChild(o2);
    });
}

async function startTranslate() {
    const input = document.getElementById('input');
    const output = document.getElementById('output');
    const detectLabel = document.getElementById('detectedInfo');
    if (!input || !output) return;
    const text = input.value.trim();
    if (!text) return;

    setBusy(true);
    try {
        // Build payload depending on manual mode
        const manualToggle = document.getElementById('manualToggle');
        const manualSource = document.getElementById('manualSource');
        const manualTarget = document.getElementById('manualTarget');

        const payload = { text };
        if (manualToggle && manualToggle.checked) {
            if (manualSource && manualSource.value) payload.source = manualSource.value;
            if (manualTarget && manualTarget.value) payload.target = manualTarget.value;
        }

        const response = await fetch('/.netlify/functions/translate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error('HTTP ' + response.status);
        const data = await response.json();

        if (data.error) {
            output.textContent = 'Error: ' + data.error;
        } else {
            const result = data.result || '';
            typeOutputAnimated(output, result);

            // Update detection/target display
            if (detectLabel) {
                const manualToggleEl = document.getElementById('manualToggle');
                if (manualToggleEl && manualToggleEl.checked) {
                    const s = document.getElementById('manualSource').value || localeString('autoOption');
                    const t = document.getElementById('manualTarget').value || '—';
                    detectLabel.textContent = `Manual: ${friendlyNameFromManualKey(s)} → ${friendlyNameFromManualKey(t)}`;
                } else {
                    const det = data.detectedSource || null;
                    const targ = data.targetUsed || null;
                    const detectedName = det ? (codeToFriendly[det] || det) : '—';
                    const targetName = targ ? (codeToFriendly[targ] || targ) : '—';
                    const locale = localizeUI();
                    detectLabel.textContent = `${locale.detectedPrefix} ${detectedName} → ${locale.translatingTo} ${targetName}`;
                }
            }
        }
    } catch (error) {
        const locale = localizeUI();
        output.textContent = locale.errorServer;
    } finally {
        setBusy(false);
    }
}

function friendlyNameFromManualKey(key) {
    if (!key) return localizeUI().autoOption || 'Auto';
    // map manual select keys to display names
    const m = manualOptions.find(o => o.key === key);
    if (!m) return key;
    const locale = localizeUI();
    return locale === i18n.es ? (m.label_es || m.label_en) : (m.label_en || m.label_es);
}

function localeString(k) {
    const l = localizeUI();
    return l[k] || k;
}

// Initialize UI
document.addEventListener('DOMContentLoaded', function() {
  const form = document.getElementById('translateForm');
  const input = document.getElementById('input');
  const output = document.getElementById('output');
  const detectBar = document.getElementById('detectBar');
  const detectedInfo = document.getElementById('detectedInfo');
  const manualToggle = document.getElementById('manualToggle');
  const manualControls = document.getElementById('manualControls');
  const manualSource = document.getElementById('manualSource');
  const manualTarget = document.getElementById('manualTarget');

  // Localize placeholder/button/help
  const locale = localizeUI();
  if (input) input.placeholder = locale.placeholder;
  const help = document.querySelector('.help');
  if (help) help.textContent = locale.help;
  const manualToggleLabel = document.getElementById('manualToggleLabel');
  if (manualToggleLabel) manualToggleLabel.textContent = locale.manualMode;
  const srcLabel = document.querySelector('label[for="manualSource"]');
  const tgtLabel = document.querySelector('label[for="manualTarget"]');
  if (srcLabel) srcLabel.textContent = locale.manualSourceLabel;
  if (tgtLabel) tgtLabel.textContent = locale.manualTargetLabel;    populateManualSelects();

    // Hide manual controls initially
    if (manualControls) manualControls.style.display = 'none';

    // Submit handler
    if (form) {
        form.addEventListener('submit', async function(e) {
            e.preventDefault();
            await startTranslate();
        });
    }

    // Debounced input
    if (input) {
        input.addEventListener('input', function() {
            if (output && output.textContent.trim()) clearOutputAnimated(output);
            if (detectTimer) clearTimeout(detectTimer);
            detectTimer = setTimeout(() => startTranslate(), DEBOUNCE_MS);
        });
    }

    // Manual toggle
    if (manualToggle) {
        manualToggle.addEventListener('change', function() {
            const manualOn = manualToggle.checked;
            if (manualControls) manualControls.style.display = manualOn ? 'flex' : 'none';
            // re-run translate to respect manual mode change
            startTranslate();
        });
    }

        // Microphone button (voice input)
        const micBtn = document.getElementById('micBtn');
        if (micBtn) {
            // Disable mic if API not supported
            if (!SpeechRecognition) {
                micBtn.disabled = true;
                micBtn.title = 'Voice not supported in this browser (Voz no soportada)';
            } else {
                micBtn.addEventListener('click', function() {
                    toggleRecognition();
                });
                // Allow Enter/Space to activate
                micBtn.addEventListener('keydown', function(e) {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggleRecognition();
                    }
                });
            }
        }

});
