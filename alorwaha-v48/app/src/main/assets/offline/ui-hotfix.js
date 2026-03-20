(() => {
  'use strict';

  /* ==========================================================================
     الإعدادات
     ========================================================================== */
  const CONFIG = {
    hashFixDelayFast: 60,
    hashFixDelaySlow: 220,
    mutationDebounceMs: 120,
    enableIntervalFallback: false,
    intervalMs: 2500
  };

  const ROUTES = Object.freeze({
    books: '#/section?name=books',
    videos: '#/section?name=videos',
    fatwas: '#/section?name=fatwas',
    posts: '#/section?name=posts',
    audios: '#/section?name=audios'
  });

  const ROUTE_RULES = Object.freeze([
    { re: /كتب|كتاب|library|books?/i, hash: ROUTES.books },
    { re: /فيديو|فديو|مرئي|مرئيات|videos?/i, hash: ROUTES.videos },
    { re: /فتاوى|فتوى|fatwa/i, hash: ROUTES.fatwas },
    { re: /مقالات|مقال|articles?|posts?/i, hash: ROUTES.posts },
    { re: /صوتيات|صوتي|صوت|audios?/i, hash: ROUTES.audios }
  ]);

  const SEARCH_WRAPPER_SELECTORS = [
    '.search-box',
    '.search-bar',
    '.toolbar-search',
    '.app-search',
    '[data-role="search"]',
    'form[role="search"]'
  ].join(',');

  const CARD_TARGET_SELECTORS = [
    'a',
    'button',
    '.content-card',
    '.hero-action',
    '.quick-link',
    '.portal-card',
    '.section-card',
    '.gateway-card'
  ].join(',');

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

  const hasGoodHash = (href) => {
    const value = String(href || '').trim();
    return (
      value.startsWith('#/section?name=') ||
      value.startsWith('#/detail?type=') ||
      value.startsWith('#/home') ||
      value.startsWith('#/downloads') ||
      value.startsWith('#/settings') ||
      value.startsWith('#/mirror?mode=')
    );
  };

  const isBadHref = (href) => {
    const value = String(href || '').trim().toLowerCase();
    return (
      value === '' ||
      value === '#' ||
      value === 'javascript:void(0)' ||
      value === 'javascript:;' ||
      value === 'void(0)' ||
      value.startsWith('javascript:')
    );
  };

  const safeSetHash = (hash) => {
    if (!hash) return;
    if (location.hash === hash) {
      window.dispatchEvent(new HashChangeEvent('hashchange'));
      return;
    }
    location.hash = hash;
  };

  function resolveSearchElement(root = document) {
    let search =
      root.querySelector(SEARCH_WRAPPER_SELECTORS) ||
      root.querySelector('input[type="search"]')?.closest('form, .search-box, .search-bar, .toolbar-search, .app-search');

    if (!search) return null;

    if (search.matches('input[type="search"]')) {
      return search.closest('form, .search-box, .search-bar, .toolbar-search, .app-search') || search;
    }

    return search;
  }

  function resolveTitleWrapper(root = document) {
    return (
      root.querySelector('.hero-content') ||
      root.querySelector('.page-hero') ||
      root.querySelector('.masthead') ||
      root.querySelector('.section-hero') ||
      root.querySelector('.page-header') ||
      root.querySelector('.header-content') ||
      root.querySelector('.hero-copy') ||
      root.querySelector('main')
    );
  }

  function resolveHeading(root = document, titleWrap = null) {
    return (
      titleWrap?.querySelector('h1') ||
      titleWrap?.querySelector('h2') ||
      root.querySelector('h1') ||
      root.querySelector('h2')
    );
  }

  function inferRouteFromText(text) {
    const clean = normalizeText(text);
    if (!clean) return null;

    const rule = ROUTE_RULES.find(item => item.re.test(clean));
    return rule ? rule.hash : null;
  }

  function inferRouteFromElement(el) {
    if (!el) return null;

    const directRoute = el.getAttribute('data-route');
    if (directRoute && hasGoodHash(directRoute)) return null;

    const href = el.getAttribute('href') || '';
    const text = el.textContent || '';
    const aria = el.getAttribute('aria-label') || '';
    const title = el.getAttribute('title') || '';
    const dataSection = el.getAttribute('data-section') || '';
    const dataType = el.getAttribute('data-type') || '';
    const merged = [text, aria, title, dataSection, dataType].join(' ');

    if (/books?|library/i.test(href)) return ROUTES.books;
    if (/fatwa/i.test(href)) return ROUTES.fatwas;
    if (/posts?|articles?/i.test(href)) return ROUTES.posts;
    if (/videos?/i.test(href)) return ROUTES.videos;
    if (/audios?/i.test(href)) return ROUTES.audios;

    return inferRouteFromText(merged);
  }

  /* ==========================================================================
     1) نقل البحث أسفل العنوان
     ========================================================================== */
  function moveSearchUnderTitle(root = document) {
    const search = resolveSearchElement(root);
    const titleWrap = resolveTitleWrapper(root);
    const heading = resolveHeading(root, titleWrap);

    if (!search || !heading) return;

    const parent = heading.parentElement || titleWrap;
    if (!parent) return;

    if (search.dataset.searchMoved === '1' && search.previousElementSibling === heading) {
      return;
    }

    if (search === heading || search.contains(heading)) return;

    heading.insertAdjacentElement('afterend', search);
    search.classList.add('search-below-title');
    search.dataset.searchMoved = '1';
  }

  /* ==========================================================================
     2) إصلاح الروابط/الأزرار
     ========================================================================== */
  function bindSectionRoute(el, hash) {
    if (!el || !hash) return;
    if (el.dataset.routeFixed === '1' && el.dataset.fixedHash === hash) return;

    el.dataset.routeFixed = '1';
    el.dataset.fixedHash = hash;
    el.style.cursor = 'pointer';

    if (el.tagName.toLowerCase() === 'a') {
      el.setAttribute('href', hash);
    }

    el.addEventListener(
      'click',
      function onSectionFix(e) {
        e.preventDefault();
        e.stopPropagation();
        safeSetHash(hash);
      },
      true
    );
  }

  function shouldFixElement(el, hash) {
    if (!el || !hash) return false;

    if (el.hasAttribute('data-route')) return false;

    const href = el.getAttribute('href') || '';
    const tag = el.tagName.toLowerCase();

    if (tag === 'a') {
      if (hasGoodHash(href)) return false;
      return isBadHref(href) || Boolean(inferRouteFromElement(el));
    }

    if (tag === 'button') return true;

    return true;
  }

  function fixSectionButtons(root = document) {
    root.querySelectorAll(CARD_TARGET_SELECTORS).forEach((el) => {
      const hash = inferRouteFromElement(el);
      if (!hash) return;
      if (!shouldFixElement(el, hash)) return;
      bindSectionRoute(el, hash);
    });
  }

  /* ==========================================================================
     تشغيل hotfix
     ========================================================================== */
  function runUiHotfix(root = document) {
    moveSearchUnderTitle(root);
    fixSectionButtons(root);
  }

  const debouncedHotfix = debounce(() => runUiHotfix(document), CONFIG.mutationDebounceMs);

  function installMutationObserver() {
    if (!document.body) return null;

    const obs = new MutationObserver((mutations) => {
      let shouldRun = false;

      for (const mutation of mutations) {
        if (mutation.type === 'childList' && (mutation.addedNodes.length || mutation.removedNodes.length)) {
          shouldRun = true;
          break;
        }
      }

      if (shouldRun) debouncedHotfix();
    });

    obs.observe(document.body, {
      childList: true,
      subtree: true
    });

    return obs;
  }

  function install() {
    runUiHotfix(document);
    installMutationObserver();

    window.addEventListener('hashchange', () => {
      setTimeout(() => runUiHotfix(document), CONFIG.hashFixDelayFast);
      setTimeout(() => runUiHotfix(document), CONFIG.hashFixDelaySlow);
    });

    if (CONFIG.enableIntervalFallback) {
      setInterval(() => runUiHotfix(document), CONFIG.intervalMs);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }
})();