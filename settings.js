(() => {
  const LANGS = [
    { code: 'en',    label: 'English',    native: 'English'    },
    { code: 'zh-CN', label: 'Chinese',    native: '中文'        },
    { code: 'hi',    label: 'Hindi',      native: 'हिन्दी'      },
    { code: 'es',    label: 'Spanish',    native: 'Español'    },
    { code: 'fr',    label: 'French',     native: 'Français'   },
    { code: 'ar',    label: 'Arabic',     native: 'العربية'    },
    { code: 'bn',    label: 'Bengali',    native: 'বাংলা'      },
    { code: 'ru',    label: 'Russian',    native: 'Русский'    },
    { code: 'pt',    label: 'Portuguese', native: 'Português'  },
    { code: 'id',    label: 'Indonesian', native: 'Indonesia'  },
    { code: 'de',    label: 'German',     native: 'Deutsch'    },
    { code: 'ja',    label: 'Japanese',   native: '日本語'      },
    { code: 'ur',    label: 'Urdu',       native: 'اردو'       },
    { code: 'ko',    label: 'Korean',     native: '한국어'      },
    { code: 'it',    label: 'Italian',    native: 'Italiano'   },
    { code: 'tr',    label: 'Turkish',    native: 'Türkçe'     },
    { code: 'vi',    label: 'Vietnamese', native: 'Tiếng Việt' },
    { code: 'th',    label: 'Thai',       native: 'ไทย'         },
    { code: 'nl',    label: 'Dutch',      native: 'Nederlands' },
    { code: 'pl',    label: 'Polish',     native: 'Polski'     }
  ];
  const DEFAULT_SOURCE = 'en';
  const DEFAULT_TARGET = 'bn';

  const sourceEl = document.getElementById('pt-source');
  const targetEl = document.getElementById('pt-target');

  function populate(selectEl) {
    LANGS.forEach(({ code, label, native }) => {
      const opt = document.createElement('option');
      opt.value = code;
      opt.textContent = label + ' — ' + native;
      selectEl.appendChild(opt);
    });
  }

  populate(sourceEl);
  populate(targetEl);

  sourceEl.addEventListener('change', () => {
    chrome.storage.sync.set({ sourceLang: sourceEl.value });
  });
  targetEl.addEventListener('change', () => {
    chrome.storage.sync.set({ targetLang: targetEl.value });
  });

  chrome.storage.sync.get(
    { sourceLang: DEFAULT_SOURCE, targetLang: DEFAULT_TARGET },
    (res) => {
      const src = LANGS.some(l => l.code === res.sourceLang) ? res.sourceLang : DEFAULT_SOURCE;
      const tgt = LANGS.some(l => l.code === res.targetLang) ? res.targetLang : DEFAULT_TARGET;
      sourceEl.value = src;
      targetEl.value = tgt;
    }
  );
})();
