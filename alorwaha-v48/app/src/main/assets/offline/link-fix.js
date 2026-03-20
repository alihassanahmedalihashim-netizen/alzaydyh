(() => {
  'use strict';

  /* ==========================================================================
     الإعدادات العامة
     ========================================================================== */
  const CONFIG = {
    mutationDebounceMs: 120,
    hashRefixDelayMs: 60,
    fallbackScanIntervalMs: 2500,
    enableFallbackInterval: false
  };

  const ROUTES = Object.freeze({
    home: '#/home',
    books: '#/section?name=books',
    fatwas: '#/section?name=fatwas',
    posts: '#/section?name=posts',
    videos: '#/section?name=videos',
    audios: '#/section?name=audios',
    news: '#/section?name=news',
    archive: '#/mirror?mode=pages',
    saved: '#/mirror?mode=opened',
    downloads: '#/downloads',
    settings: '#/settings'
  });

  const SECTION_ALIASES = Object.freeze({
    books: ROUTES.books,
    book: ROUTES.books,
    library: ROUTES.books,

    fatwas: ROUTES.fatwas,
    fatwa: ROUTES.fatwas,

    posts: ROUTES.posts,
    post: ROUTES.posts,
    articles: ROUTES.posts,
    article: ROUTES.posts,

    videos: ROUTES.videos,
    video: ROUTES.videos,

    audios: ROUTES.audios,
    audio: ROUTES.audios,

    news: ROUTES.news,
    home: ROUTES.home,
    archive: ROUTES.archive,
    saved: ROUTES.saved,
    downloads: ROUTES.downloads,
    settings: ROUTES.settings
  });

  const TEXT_RULES = Object.freeze([
    [/^الرئيسية$|^الصفحة الرئيسية$|^home$/i, ROUTES.home],
    [/كتب|كتاب|library|books?/i, ROUTES.books],
    [/فتاوى|فتوى|fatwa/i, ROUTES.fatwas],
    [/مقالات|مقال|articles?|posts?/i, ROUTES.posts],
    [/فيديو|فديو|مرئي|مرئيات|videos?/i, ROUTES.videos],
    [/صوتيات|صوتي|صوت|audios?/i, ROUTES.audios],
    [/أخبار|خبر|news/i, ROUTES.news],
    [/أرشيف|archive/i, ROUTES.archive],
    [/محفوظ|saved/i, ROUTES.saved],
    [/تنزيل|تحميل|downloads?/i, ROUTES.downloads],
    [/إعدادات|settings/i, ROUTES.settings]
  ]);

  const TARGET_SELECTORS = [
    'a',
    'button',
    '[role="button"]',
    '[data-section]',
    '[data-kind]',
    '[data-type]',
    '[data-target]',
    '.content-card',
    '.hero-action',
    '.quick-link',
    '.portal-card',
    '.section-card',
    '.gateway-card',
    '.nav-link',
    '.tab-link',
    '.menu-link'
  ].join(',');

  const FIX_FLAG = 'linkFixed';
  const ROUTE_FLAG = 'fixedRoute';

  /* ==========================================================================
     أدوات مساعدة
     ========================================================================== */
  const normalizeText = (value) =>
    String(value || '')
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase();

  const debounce = (fn, wait = 100) => {
    let timer = null;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), wait);
    };
  };

  const isHashRoute = (href) => /^#\/.+/.test(String(href || '').trim());

  const isBadHref = (href) => {
    const value = String(href || '').trim().toLowerCase();
    return (
      value === '' ||
      value === '#' ||
      value === 'void(0)' ||
      value === 'javascript:void(0)' ||
      value === 'javascript:;' ||
      value.startsWith('javascript:')
    );
  };

  const isInteractiveChild = (el) => {
    if (!el) return false;
    return !!el.closest('a, button, input, select, textarea, [data-route]');
  };

  const safeSetHash = (route) => {
    if (!route) return;
    if (window.location.hash === route) {
      window.dispatchEvent(new HashChangeEvent('hashchange'));
      return;
    }
    window.location.hash = route;
  };

  /* ==========================================================================
     استنتاج المسار
     ========================================================================== */
  function guessRouteFromText(text) {
    const clean = normalizeText(text);
    if (!clean) return null;

    for (const [regex, route] of TEXT_RULES) {
      if (regex.test(clean)) return route;
    }

    return null;
  }

  function guessRouteFromHref(href) {
    const h = String(href || '').trim();
    if (!h) return null;

    if (isHashRoute(h)) return h;
    if (h === '#') return null;

    if (/books?|library/i.test(h)) return ROUTES.books;
    if (/fatwa/i.test(h)) return ROUTES.fatwas;
    if (/posts?|articles?|about-zaydiyah/i.test(h)) return ROUTES.posts;
    if (/videos?|video-details|library-video/i.test(h)) return ROUTES.videos;
    if (/audios?|audio-details|library-audio/i.test(h)) return ROUTES.audios;
    if (/news/i.test(h)) return ROUTES.news;
    if (/archive/i.test(h)) return ROUTES.archive;
    if (/saved/i.test(h)) return ROUTES.saved;
    if (/downloads?/i.test(h)) return ROUTES.downloads;
    if (/settings/i.test(h)) return ROUTES.settings;

    return null;
  }

  function getExplicitSection(el) {
    if (!el) return null;

    const candidates = [
      el.getAttribute('data-section'),
      el.getAttribute('data-kind'),
      el.getAttribute('data-type'),
      el.getAttribute('data-target'),
      el.getAttribute('data-route'),
      el.getAttribute('href'),
      el.getAttribute('aria-label'),
      el.getAttribute('title')
    ].filter(Boolean);

    for (const raw of candidates) {
      const value = normalizeText(raw);

      if (SECTION_ALIASES[value]) {
        return SECTION_ALIASES[value];
      }

      for (const key of Object.keys(SECTION_ALIASES)) {
        if (
          value === key ||
          value.includes(`/${key}`) ||
          value.includes(`${key}.php`) ||
          value.includes(`section?name=${key}`) ||
          value.includes(`section/${key}`)
        ) {
          return SECTION_ALIASES[key];
        }
      }
    }

    return null;
  }

  function deriveRoute(el) {
    if (!el) return null;

    const explicit = getExplicitSection(el);
    if (explicit) return explicit;

    const href = el.getAttribute('href') || '';
    const fromHref = guessRouteFromHref(href);
    if (fromHref) return fromHref;

    const text = el.textContent || '';
    const fromText = guessRouteFromText(text);
    if (fromText) return fromText;

    return null;
  }

  /* ==========================================================================
     إصلاح العناصر
     ========================================================================== */
  function bindFixedNavigation(el, route) {
    if (!el || !route) return;
    if (el.dataset[FIX_FLAG] === '1' && el.dataset[ROUTE_FLAG] === route) return;

    el.dataset[FIX_FLAG] = '1';
    el.dataset[ROUTE_FLAG] = route;
    el.style.cursor = 'pointer';

    if (el.tagName.toLowerCase() === 'a') {
      el.setAttribute('href', route);
    }

    el.addEventListener(
      'click',
      function onFixedClick(e) {
        const clickedInteractiveChild = e.target !== el && isInteractiveChild(e.target);
        if (clickedInteractiveChild) return;

        e.preventDefault();
        e.stopPropagation();
        safeSetHash(route);
      },
      true
    );
  }

  function shouldRepairElement(el, route) {
    if (!el || !route) return false;

    const href = el.getAttribute('href') || '';
    const tag = el.tagName.toLowerCase();

    if (el.hasAttribute('data-route')) return false;

    if (tag === 'a') {
      if (isHashRoute(href)) return false;
      return isBadHref(href) || !!guessRouteFromHref(href) || !!guessRouteFromText(el.textContent);
    }

    if (tag === 'button' || el.getAttribute('role') === 'button') {
      return true;
    }

    return true;
  }

  function repairElement(el) {
    if (!el) return;

    const route = deriveRoute(el);
    if (!route) return;
    if (!shouldRepairElement(el, route)) return;

    bindFixedNavigation(el, route);
  }

  function fixAllLinks(root = document) {
    root.querySelectorAll(TARGET_SELECTORS).forEach(repairElement);
  }

  /* ==========================================================================
     المراقبة والتثبيت
     ========================================================================== */
  const debouncedFixAll = debounce(() => fixAllLinks(document), CONFIG.mutationDebounceMs);

  function installMutationObserver() {
    if (!document.body) return null;

    const observer = new MutationObserver((mutations) => {
      let shouldRun = false;

      for (const mutation of mutations) {
        if (mutation.type === 'childList' && (mutation.addedNodes.length || mutation.removedNodes.length)) {
          shouldRun = true;
          break;
        }
      }

      if (shouldRun) debouncedFixAll();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    return observer;
  }

  function installHashWatcher() {
    window.addEventListener('hashchange', () => {
      setTimeout(() => fixAllLinks(document), CONFIG.hashRefixDelayMs);
    });
  }

  function installFallbackInterval() {
    if (!CONFIG.enableFallbackInterval) return null;
    return window.setInterval(() => {
      fixAllLinks(document);
    }, CONFIG.fallbackScanIntervalMs);
  }

  function install() {
    fixAllLinks(document);
    installMutationObserver();
    installHashWatcher();
    installFallbackInterval();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }
})();