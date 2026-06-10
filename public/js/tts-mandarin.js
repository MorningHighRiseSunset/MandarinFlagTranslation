// public/js/tts-mandarin.js
// Robust Mandarin TTS auto-attacher
// - Picks a Chinese voice when available
// - Waits for voices to load before speaking
// - Attaches to likely "speaker" buttons automatically
// - Falls back to a server-side /api/tts?text=... endpoint if no local zh voice exists

(function (global) {
  'use strict';

  function debug(...args) { console.debug('[tts-mandarin]', ...args); }
  function warn(...args) { console.warn('[tts-mandarin]', ...args); }
  function err(...args) { console.error('[tts-mandarin]', ...args); }

  function getVoices() {
    try { return (window.speechSynthesis && speechSynthesis.getVoices()) || []; } catch (e) { return []; }
  }

  function findZhVoice() {
    const voices = getVoices();
    return voices.find(v => v.lang && v.lang.toLowerCase().startsWith('zh')) || null;
  }

  function speakWithWebSpeech(text, preferredLang = 'zh-CN') {
    if (!('speechSynthesis' in window)) {
      warn('Web Speech API not available');
      return false;
    }
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = preferredLang;
      const zh = findZhVoice();
      if (zh) {
        u.voice = zh;
        debug('Using voice', zh.name, zh.lang);
      } else {
        debug('No zh voice found; setting lang and attempting speak');
      }
      u.rate = 0.95;
      u.pitch = 1;
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
      return true;
    } catch (e) {
      err('speechSynthesis error', e);
      return false;
    }
  }

  async function speakWithServerTTS(text) {
    if (!text) return false;
    try {
      const url = '/.netlify/functions/tts?text=' + encodeURIComponent(text);
      const resp = await fetch(url, { method: 'GET' });
      if (!resp.ok) {
        err('Server TTS fetch failed', resp.status, resp.statusText);
        return false;
      }
      const blob = await resp.blob();
      const obj = URL.createObjectURL(blob);
      const audio = new Audio(obj);
      await audio.play();
      audio.onended = () => URL.revokeObjectURL(obj);
      return true;
    } catch (e) {
      err('Server TTS playback error', e);
      return false;
    }
  }

  function whenVoicesLoaded(timeout = 1500) {
    return new Promise(resolve => {
      const v = getVoices();
      if (v.length) return resolve(v);
      let done = false;
      const timer = setTimeout(() => {
        if (!done) {
          done = true;
          if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = null;
          resolve(getVoices());
        }
      }, timeout);
      if (window.speechSynthesis) {
        window.speechSynthesis.onvoiceschanged = () => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          const voices = getVoices();
          window.speechSynthesis.onvoiceschanged = null;
          resolve(voices);
        };
      } else {
        clearTimeout(timer);
        resolve([]);
      }
    });
  }

  async function playMandarinText(text) {
    if (!text) {
      warn('No text provided to playMandarinText');
      return;
    }

    if (!('speechSynthesis' in window)) {
      debug('Browser has no speechSynthesis; attempting server fallback');
      await speakWithServerTTS(text);
      return;
    }

    await whenVoicesLoaded();

    const zh = findZhVoice();
    if (zh) {
      const ok = speakWithWebSpeech(text, zh.lang || 'zh-CN');
      if (ok) return;
    }

    const ok = speakWithWebSpeech(text, 'zh-CN');
    if (ok) return;

    debug('Falling back to server-side TTS');
    await speakWithServerTTS(text);
  }

  function findTextForButton(btn) {
    const targetSel = btn.getAttribute('data-tts-target');
    if (targetSel) {
      try {
        const el = document.querySelector(targetSel);
        if (el) return extractTextFromElement(el);
      } catch (e) {
        // ignore
      }
    }

    const explicit = btn.getAttribute('data-tts-text');
    if (explicit) return explicit;

    const parent = btn.parentElement;
    if (parent) {
      const selectors = ['.chinese-text', '.zh', '.hanzi', '[data-chinese]', '[data-tts-text]'];
      for (const s of selectors) {
        const el = parent.querySelector(s);
        if (el) return extractTextFromElement(el);
      }
    }

    const globalCand = document.querySelector('.chinese-text, .zh, .hanzi, [data-chinese]');
    if (globalCand) return extractTextFromElement(globalCand);

    const desc = btn.getAttribute('aria-describedby') || btn.getAttribute('aria-controls');
    if (desc) {
      const el = document.getElementById(desc);
      if (el) return extractTextFromElement(el);
    }

    const prev = btn.previousElementSibling;
    if (prev) return extractTextFromElement(prev);
    const next = btn.nextElementSibling;
    if (next) return extractTextFromElement(next);

    const label = btn.getAttribute('aria-label') || btn.title || btn.textContent;
    return label ? label.trim() : '';
  }

  function extractTextFromElement(el) {
    if (!el) return '';
    if (el.value !== undefined && el.value.trim) {
      const val = el.value.trim();
      if (val) return val;
    }
    const text = (el.innerText || el.textContent || '').trim();
    return text;
  }

  function attachToButton(btn) {
    if (!btn) return;
    if (btn.__ttsAttached) return;
    btn.__ttsAttached = true;
    btn.addEventListener('click', async (ev) => {
      try {
        const text = findTextForButton(btn);
        if (!text) {
          warn('No text found for TTS on button', btn);
          return;
        }
        debug('Button clicked; speaking text:', text);
        await playMandarinText(text);
      } catch (e) {
        err('Error in TTS button handler', e);
      }
    });
    debug('Attached TTS handler to button', btn);
  }

  function discoverAndAttach() {
    const buttons = Array.from(document.querySelectorAll('button, [role="button"], a'));
    const found = [];
    for (const b of buttons) {
      if (!(b.offsetWidth || b.offsetHeight)) continue;
      const classText = (b.className || '').toString().toLowerCase();
      const title = (b.title || '').toString().toLowerCase();
      const aria = (b.getAttribute('aria-label') || '').toString().toLowerCase();
      const text = (b.innerText || b.textContent || '').toString().toLowerCase();

      const keywords = ['speak', 'speaker', 'tts', 'audio', '🔊', '🔈', 'play'];
      const joined = classText + ' ' + title + ' ' + aria + ' ' + text;
      if (keywords.some(k => joined.includes(k))) {
        attachToButton(b);
        found.push(b);
        continue;
      }

      if (b.hasAttribute('data-tts-text') || b.hasAttribute('data-tts-target')) {
        attachToButton(b);
        found.push(b);
      }
    }
    debug('discoverAndAttach: attached to', found.length, 'buttons');
    return found;
  }

  function autoAttachOnDomReady() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        discoverAndAttach();
        observeForNewButtons();
      });
    } else {
      discoverAndAttach();
      observeForNewButtons();
    }
  }

  function observeForNewButtons() {
    try {
      const obs = new MutationObserver(muts => {
        for (const m of muts) {
          for (const node of m.addedNodes) {
            if (!(node instanceof HTMLElement)) continue;
            if (node.matches && (node.matches('button') || node.matches('[role="button"]') || node.matches('a'))) {
              const b = node;
              attachToButton(b);
            }
            const inner = node.querySelector && node.querySelectorAll && node.querySelectorAll('button, [role="button"], a');
            if (inner && inner.length) {
              inner.forEach(el => attachToButton(el));
            }
          }
        }
      });
      obs.observe(document.documentElement || document.body, { childList: true, subtree: true });
    } catch (e) {
      // ignore in very old browsers
    }
  }

  global.MandarinTTS = {
    playMandarinText,
    speakWithWebSpeech,
    speakWithServerTTS,
    attachToButton,
    discoverAndAttach
  };

  autoAttachOnDomReady();

})(window);