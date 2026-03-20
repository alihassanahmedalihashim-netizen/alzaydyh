(() => {
  'use strict';

  /* ==========================================================================
     الثوابت والخدمات الأساسية
     ========================================================================== */
  const APP = {
    NAME: 'AlorwahaApp',
    STORAGE_KEYS: {
      favorites: 'alorwaha_favorites',
      history: 'alorwaha_history',
      theme: 'alorwaha_theme',
      textScale: 'alorwaha_text_scale',
      recentSearches: 'alorwaha_recent_searches',
      lastRoute: 'alorwaha_last_route'
    },
    BASE_LOCAL_URL: 'https://appassets.androidplatform.net/local/',
    DEFAULT_TITLE: 'العروة الوثقى',
    MAX_HISTORY: 40,
    MAX_RECENT_SEARCHES: 8,
    MAX_CATEGORY_CHIPS: 20,
    MAX_SUGGESTIONS: 8,
    MAX_RELATED: 6,
    MAX_FEATURED: 8
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  const escapeHtml = (value) =>
    String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

  const safeAttr = (value) => escapeHtml(value).replace(/"/g, '&quot;');

  const stripHtml = (html) => {
    const div = document.createElement('div');
    div.innerHTML = html || '';
    return (div.textContent || div.innerText || '').trim();
  };

  const debounce = (fn, wait = 120) => {
    let timer = null;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), wait);
    };
  };

  const Storage = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch {
        return fallback;
      }
    },
    getText(key, fallback = '') {
      try {
        const raw = localStorage.getItem(key);
        return raw ?? fallback;
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {}
    },
    setText(key, value) {
      try {
        localStorage.setItem(key, String(value));
      } catch {}
    }
  };

  const Bridge = {
    syncNow() {
      window.AndroidBridge?.syncNow?.();
    },
    openExternal(url) {
      if (!url) return;
      if (window.AndroidBridge?.openExternal) {
        window.AndroidBridge.openExternal(url);
        return;
      }
      window.open(url, '_blank');
    },
    openSavedArchive(url) {
      if (!url) return;
      if (window.AndroidBridge?.openSavedArchive) {
        window.AndroidBridge.openSavedArchive(url);
        return;
      }
      this.openExternal(url);
    },
    openBookViewer(url, title = '') {
      window.AndroidBridge?.openBookViewer?.(url, title);
    },
    openMediaViewer(url, title = '', kind = 'audio') {
      window.AndroidBridge?.openMediaViewer?.(url, title, kind);
    },
    downloadFile(url, fileName = '') {
      if (!url) return;
      if (window.AndroidBridge?.downloadFile) {
        window.AndroidBridge.downloadFile(url, fileName);
        return;
      }
      this.openExternal(url);
    },
    copyText(text) {
      if (!text) return;
      if (window.AndroidBridge?.copyText) {
        window.AndroidBridge.copyText(text);
        return;
      }
      navigator.clipboard?.writeText(text);
    },
    shareText(title = '', url = '') {
      if (window.AndroidBridge?.shareText) {
        window.AndroidBridge.shareText(title, url);
        return;
      }
      if (navigator.share) {
        navigator.share({ title, text: title, url }).catch(() => {});
      }
    },
    toast(message) {
      if (!message) return;
      window.AndroidBridge?.toast?.(message);
    }
  };

  const Api = {
    async fetchJson(path) {
      try {
        const res = await fetch(`${APP.BASE_LOCAL_URL}${path}`, { cache: 'no-store' });
        if (!res.ok) return null;
        return await res.json();
      } catch {
        return null;
      }
    }
  };

  /* ==========================================================================
     الحالة العامة
     ========================================================================== */
  const state = {
    sections: [],
    data: {},
    appState: null,
    query: '',
    selectedCategory: 'all',
    activeType: 'all',
    labels: {
      home: 'الرئيسية',
      posts: 'المقالات',
      fatwas: 'الفتاوى',
      books: 'الكتب',
      news: 'الأخبار',
      audios: 'الصوتيات',
      videos: 'الفيديو',
      favorites: 'المحفوظات',
      history: 'سجل القراءة',
      downloads: 'التنزيلات',
      mirror: 'الأرشيف',
      settings: 'الإعدادات'
    },
    icons: {
      posts: '📰',
      fatwas: '📚',
      books: '📘',
      news: '🗞️',
      audios: '🎧',
      videos: '🎬',
      downloads: '⬇️'
    },
    favorites: new Set(Storage.get(APP.STORAGE_KEYS.favorites, [])),
    history: Storage.get(APP.STORAGE_KEYS.history, []),
    theme: Storage.getText(APP.STORAGE_KEYS.theme, 'auto'),
    textScale: Number(Storage.getText(APP.STORAGE_KEYS.textScale, '1')),
    recentSearches: Storage.get(APP.STORAGE_KEYS.recentSearches, []),
    siteMirror: {
      summary: null,
      opened: [],
      pages: [],
      media: []
    }
  };

  /* ==========================================================================
     أدوات الحالة
     ========================================================================== */
  const favoriteKey = (item) => `${item.type}:${item.id}`;

  const saveFavorites = () =>
    Storage.set(APP.STORAGE_KEYS.favorites, [...state.favorites]);

  const saveHistory = () =>
    Storage.set(APP.STORAGE_KEYS.history, state.history.slice(0, APP.MAX_HISTORY));

  const saveRecentSearches = () =>
    Storage.set(APP.STORAGE_KEYS.recentSearches, state.recentSearches.slice(0, APP.MAX_RECENT_SEARCHES));

  const saveTextScale = () => {
    Storage.setText(APP.STORAGE_KEYS.textScale, state.textScale);
    document.documentElement.style.setProperty('--reader-scale', String(state.textScale));
  };

  const rememberSearch = (query) => {
    const value = String(query || '').trim();
    if (value.length < 2) return;
    state.recentSearches = [value, ...state.recentSearches.filter(v => v !== value)].slice(0, APP.MAX_RECENT_SEARCHES);
    saveRecentSearches();
  };

  const rememberItem = (item) => {
    const key = favoriteKey(item);
    state.history = [key, ...state.history.filter(v => v !== key)];
    saveHistory();
  };

  const toggleFavorite = (item) => {
    const key = favoriteKey(item);
    if (state.favorites.has(key)) {
      state.favorites.delete(key);
      Bridge.toast('تمت إزالة العنصر من المحفوظات');
    } else {
      state.favorites.add(key);
      Bridge.toast('تم حفظ العنصر');
    }
    saveFavorites();
  };

  /* ==========================================================================
     التوجيه
     ========================================================================== */
  const routeInfo = () => {
    const raw = window.location.hash || '#/home';
    const normalized = raw.replace(/^#\/?/, '');
    const [routeName, queryString = ''] = normalized.split('?');
    const params = new URLSearchParams(queryString);

    return {
      view: routeName || 'home',
      section: params.get('name') || 'posts',
      type: params.get('type') || '',
      id: params.get('id') || '',
      feed: params.get('feed') || '',
      category: params.get('category') || '',
      mode: params.get('mode') || 'opened'
    };
  };

  const setRoute = (hash) => {
    if (window.location.hash === hash) {
      render();
    } else {
      window.location.hash = hash;
    }
  };

  const persistLastRoute = () => {
    const current = window.location.hash || '#/home';
    if (!current.startsWith('#/detail')) {
      Storage.setText(APP.STORAGE_KEYS.lastRoute, current);
    }
  };

  const restoreLastRoute = () => {
    if (window.location.hash && window.location.hash !== '#') return false;
    window.location.hash = Storage.getText(APP.STORAGE_KEYS.lastRoute, '#/home');
    return true;
  };

  /* ==========================================================================
     أدوات البيانات
     ========================================================================== */
  const sectionTitle = (section) =>
    state.appState?.sectionTitles?.[section] || state.labels[section] || section;

  const sectionIcon = (section) => state.icons[section] || '📄';

  const listForSection = (section) => state.data[section]?.items || [];

  const getAllItems = () => state.sections.flatMap(section => listForSection(section));

  const findItemFromKey = (key) => {
    const [type, id] = String(key || '').split(':');
    return listForSection(type).find(item => String(item.id) === String(id));
  };

  const categoriesFor = (items) =>
    ['all', ...new Set(items.map(item => item.category).filter(Boolean))].slice(0, APP.MAX_CATEGORY_CHIPS);

  const availableTypes = (items) =>
    ['all', ...new Set(items.map(item => item.type).filter(Boolean))];

  const normalizeMirrorList = (raw) => {
    if (Array.isArray(raw)) return raw;
    if (raw && Array.isArray(raw.items)) return raw.items;
    return [];
  };

  const formatMeta = (item) =>
    [item.category, item.author, item.publishedAt].filter(Boolean).join(' • ');

  const estimateReadMinutes = (item) => {
    const raw = stripHtml(item.body || item.summary || item.excerpt || '');
    const words = raw.split(/\s+/).filter(Boolean).length;
    return `${Math.max(1, Math.round(words / 180))} دقيقة قراءة`;
  };

  const getFilteredItems = (items) => {
    const query = state.query.trim().toLowerCase();
    const category = state.selectedCategory;
    const activeType = state.activeType || 'all';

    return items.filter(item => {
      const categoryOk = category === 'all' || (item.category || '') === category;
      const typeOk = activeType === 'all' || (item.type || '') === activeType;
      if (!categoryOk || !typeOk) return false;
      if (!query) return true;

      return [
        item.title,
        item.subtitle,
        item.summary,
        item.excerpt,
        stripHtml(item.body),
        item.category,
        item.author,
        item.sourceName
      ]
        .join(' ')
        .toLowerCase()
        .includes(query);
    });
  };

  const searchSuggestions = (items, query) => {
    const q = String(query || '').trim().toLowerCase();
    if (q.length < 2) return [];

    const seen = new Set();
    const out = [];

    for (const item of items) {
      const candidates = [item.title, item.category, item.author, item.sourceName].filter(Boolean);
      for (const raw of candidates) {
        const value = String(raw).trim();
        const key = value.toLowerCase();
        if (!value || seen.has(key) || !key.includes(q)) continue;
        seen.add(key);
        out.push({ label: value, meta: item.type ? sectionTitle(item.type) : '' });
        if (out.length >= APP.MAX_SUGGESTIONS) return out;
      }
    }

    return out;
  };

  const scopedItemsForSuggestions = () => {
    const route = routeInfo();
    if (route.view === 'section') return listForSection(route.section);
    if (route.view === 'favorites') return [...state.favorites].map(findItemFromKey).filter(Boolean);
    if (route.view === 'history') return state.history.map(findItemFromKey).filter(Boolean);
    return getAllItems();
  };

  const relatedItems = (item) => {
    const sameSection = listForSection(item.type).filter(entry => String(entry.id) !== String(item.id));
    const sameCategory = item.category ? sameSection.filter(entry => entry.category === item.category) : [];
    const sameAuthor = item.author ? sameSection.filter(entry => entry.author === item.author) : [];
    const sameSource = item.sourceName ? sameSection.filter(entry => entry.sourceName === item.sourceName) : [];
    const merged = [...sameCategory, ...sameAuthor, ...sameSource, ...sameSection];
    const seen = new Set();

    return merged.filter(entry => {
      const key = favoriteKey(entry);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, APP.MAX_RELATED);
  };

  /* ==========================================================================
     القوالب
     ========================================================================== */
  const fallbackCover = (item) => {
    const mark = (item.title || 'ع').trim().charAt(0) || 'ع';
    return `<div class="cover-fallback">${escapeHtml(mark)}</div>`;
  };

  const activeFiltersSummary = (items) => {
    const chips = [];
    if (state.query) chips.push(`<button class="chip soft" data-clear-filter="query">البحث: ${escapeHtml(state.query)}</button>`);
    if (state.selectedCategory !== 'all') chips.push(`<button class="chip soft" data-clear-filter="category">التصنيف: ${escapeHtml(state.selectedCategory)}</button>`);
    if (state.activeType !== 'all') chips.push(`<button class="chip soft" data-clear-filter="type">النوع: ${escapeHtml(sectionTitle(state.activeType))}</button>`);

    if (!chips.length) {
      return `<div class="results-strip">${items.length} نتيجة</div>`;
    }

    return `
      <div class="filter-summary">
        <div class="results-strip">${items.length} نتيجة نشطة</div>
        <div class="chip-row">${chips.join('')}</div>
      </div>
    `;
  };

  const renderCategoryChips = (items) => {
    const chips = categoriesFor(items);
    if (chips.length <= 1) return '';
    return `
      <div class="chip-row">
        ${chips.map(cat => `
          <button class="chip ${state.selectedCategory === cat ? 'active' : ''}" data-category="${safeAttr(cat)}">
            ${cat === 'all' ? 'الكل' : escapeHtml(cat)}
          </button>
        `).join('')}
      </div>
    `;
  };

  const renderTypeChips = (items) => {
    const types = availableTypes(items);
    if (types.length <= 2) return '';
    return `
      <div class="type-filter-row">
        ${types.map(type => `
          <button class="chip type-chip ${state.activeType === type ? 'active' : ''}" data-type="${safeAttr(type)}">
            ${type === 'all' ? 'كل الأنواع' : escapeHtml(sectionTitle(type))}
          </button>
        `).join('')}
      </div>
    `;
  };

  const renderRecentSearches = () => {
    if (!state.recentSearches.length) return '';
    return `
      <div class="recent-searches">
        <span class="recent-label">عمليات بحث سابقة</span>
        ${state.recentSearches.map(term => `
          <button class="chip soft" data-search-term="${safeAttr(term)}">${escapeHtml(term)}</button>
        `).join('')}
      </div>
    `;
  };

  const cardTemplate = (item) => {
    const key = favoriteKey(item);
    const isFav = state.favorites.has(key);
    const cover = item.coverUrl
      ? `<img src="${safeAttr(item.coverUrl)}" alt="${safeAttr(item.title || '')}" loading="lazy">`
      : fallbackCover(item);

    return `
      <article class="content-card glass-card">
        <div class="card-cover">${cover}</div>
        <div class="card-body">
          <div class="card-eyebrow">
            ${item.type ? `${sectionIcon(item.type)} ${escapeHtml(state.labels[item.type] || item.type)}` : ''}
          </div>
          <h3>${escapeHtml(item.title || 'بدون عنوان')}</h3>
          <p>${escapeHtml(item.excerpt || item.summary || '')}</p>
          <div class="meta-row">${escapeHtml(formatMeta(item))}</div>
          <div class="card-actions">
            <button class="primary-btn" data-route="#/detail?type=${safeAttr(item.type)}&id=${safeAttr(item.id)}">قراءة</button>
            <button class="ghost-btn" data-favorite="${safeAttr(key)}">${isFav ? 'إزالة الحفظ' : 'حفظ'}</button>
            ${(item.fileUrl || item.url) ? `<button class="ghost-btn" data-resource-key="${safeAttr(key)}">${item.fileUrl ? 'الملف' : 'المصدر'}</button>` : ''}
          </div>
        </div>
      </article>
    `;
  };

  const sectionHeroTemplate = (section, items) => {
    const count = Number(state.appState?.sectionCounts?.[section] || items.length || 0);
    const categoryCount = new Set(items.map(item => item.category).filter(Boolean)).size;
    const latest = items[0];

    return `
      <section class="section-hero glass-card section-${safeAttr(section)}">
        <div>
          <div class="eyebrow">${sectionIcon(section)} ${escapeHtml(sectionTitle(section))}</div>
          <h2>${escapeHtml(sectionTitle(section))}</h2>
          <p>عرض محلي منظم للمحتوى المحفوظ داخل هذا القسم.</p>
        </div>
        <div class="section-hero-stats">
          <div><strong>${count}</strong><span>إجمالي العناصر</span></div>
          <div><strong>${categoryCount}</strong><span>تصنيفًا</span></div>
          <div><strong>${escapeHtml(latest?.publishedAt || '—')}</strong><span>آخر تحديث</span></div>
        </div>
      </section>
    `;
  };

  const detailTemplate = (item) => {
    const key = favoriteKey(item);
    const isFav = state.favorites.has(key);
    const related = relatedItems(item);

    return `
      <article id="detailTop" class="detail-card glass-card detail-${safeAttr(item.type)}">
        <div class="detail-topbar">
          <button class="ghost-btn small" data-route="#/section?name=${safeAttr(item.type)}">رجوع</button>
          <div class="reader-tools">
            <button class="ghost-btn small" data-scale-action="plus">A+</button>
            <button class="ghost-btn small" data-scale-action="minus">A-</button>
          </div>
        </div>

        <div class="eyebrow">${sectionIcon(item.type)} ${escapeHtml(sectionTitle(item.type))}</div>
        <h1>${escapeHtml(item.title || 'بدون عنوان')}</h1>
        <div class="meta">${escapeHtml(formatMeta(item))}</div>

        ${item.coverUrl ? `
          <div class="detail-cover">
            <img src="${safeAttr(item.coverUrl)}" alt="${safeAttr(item.title || '')}">
          </div>
        ` : ''}

        ${item.summary ? `<p class="lead">${escapeHtml(item.summary)}</p>` : ''}

        <div class="detail-reference-grid glass-card">
          ${item.category ? `<div><span>التصنيف</span><strong>${escapeHtml(item.category)}</strong></div>` : ''}
          ${item.author ? `<div><span>الكاتب</span><strong>${escapeHtml(item.author)}</strong></div>` : ''}
          ${item.sourceName ? `<div><span>المصدر</span><strong>${escapeHtml(item.sourceName)}</strong></div>` : ''}
          ${item.publishedAt ? `<div><span>التاريخ</span><strong>${escapeHtml(item.publishedAt)}</strong></div>` : ''}
        </div>

        <section id="detailBody" class="detail-block">
          <div class="body-content">
            ${item.body || `<p>${escapeHtml(item.excerpt || item.summary || '')}</p>`}
          </div>
        </section>

        <div class="detail-actions">
          <button class="primary-btn" data-share-item="${safeAttr(key)}">مشاركة</button>
          <button class="ghost-btn" data-copy-item="${safeAttr(key)}">نسخ الرابط</button>
          <button class="ghost-btn" data-favorite="${safeAttr(key)}">${isFav ? 'إزالة الحفظ' : 'حفظ'}</button>
          ${item.fileUrl ? `<button class="ghost-btn" data-resource-key="${safeAttr(key)}">فتح الملف</button>` : ''}
          ${item.url ? `<button class="ghost-btn" data-open-url="${safeAttr(item.url)}">فتح المصدر</button>` : ''}
        </div>

        ${related.length ? `
          <section id="detailRelated" class="related-section">
            <div class="section-head">
              <h3>مواد ذات صلة</h3>
              <span class="results-strip">من نفس القسم أو التصنيف</span>
            </div>
            <div class="content-grid related-grid">
              ${related.map(cardTemplate).join('')}
            </div>
          </section>
        ` : ''}
      </article>
    `;
  };

  const homeTemplate = (feed = '') => {
    const latestMap = state.appState?.latest || {};
    const latest = Object.values(latestMap).flat();
    const allLatest = latest.length ? latest : getAllItems().slice(0, 14);
    const featuredSeed = state.appState?.highlights?.length ? state.appState.highlights : allLatest;
    const featured = featuredSeed.slice(0, APP.MAX_FEATURED);
    const dataSet = feed === 'latest' ? allLatest : featured;
    const filtered = getFilteredItems(dataSet);

    const hero = state.appState?.hero || {};
    const heroTitle = hero.title || state.appState?.siteTitle || APP.DEFAULT_TITLE;
    const heroSubtitle = hero.subtitle || 'تجربة أقرب للموقع مع مزامنة أحدث المحتويات والعمل دون اتصال.';
    const heroImg = state.appState?.heroImageUrl || featured[0]?.coverUrl || '';

    return `
      <section class="hero-card glass-card">
        <div class="hero-copy">
          <div class="eyebrow">التطبيق الرسمي</div>
          <div class="site-badges"><span>مزامنة محلية</span><span>قراءة دون اتصال</span><span>واجهة أقرب للموقع</span></div>
          <h2>${escapeHtml(heroTitle)}</h2>
          <p>${escapeHtml(heroSubtitle)}</p>
          <div class="hero-actions">
            <button class="primary-btn" data-sync-now="1">مزامنة الآن</button>
            <button class="ghost-btn" data-route="#/home?feed=latest">أحدث المحتوى</button>
            <button class="ghost-btn" data-route="#/section?name=posts">ابدأ التصفح</button>
          </div>
        </div>
        <div class="hero-media">
          ${heroImg ? `<img src="${safeAttr(heroImg)}" alt="صورة الغلاف">` : `<div class="hero-placeholder">${escapeHtml(APP.DEFAULT_TITLE)}</div>`}
        </div>
      </section>

      ${renderRecentSearches()}

      <section class="section-block">
        <div class="section-head">
          <h3>${feed === 'latest' ? 'أحدث الإضافات' : 'مختارات مميزة'}</h3>
          <div class="section-tools">
            <button class="inline-link-btn" data-route="#/history">سجل القراءة</button>
            <button class="inline-link-btn" data-route="#/favorites">المحفوظات</button>
          </div>
        </div>
        ${renderCategoryChips(dataSet)}
        ${activeFiltersSummary(filtered)}
        <div class="content-grid" id="homeGrid">
          ${filtered.length
            ? filtered.map(cardTemplate).join('')
            : '<div class="empty-state glass-card">لا توجد عناصر متاحة.</div>'}
        </div>
      </section>

      ${state.sections.map(section => {
        const items = listForSection(section).slice(0, 4);
        if (!items.length) return '';
        return `
          <section class="section-block">
            <div class="section-head">
              <h3>${escapeHtml(sectionTitle(section))}</h3>
              <button class="inline-link-btn" data-route="#/section?name=${safeAttr(section)}">عرض الكل</button>
            </div>
            <div class="content-grid">
              ${items.map(cardTemplate).join('')}
            </div>
          </section>
        `;
      }).join('')}
    `;
  };

  const collectionTemplate = (title, items, sectionKey = '') => {
    const filtered = getFilteredItems(items);

    return `
      ${sectionKey ? sectionHeroTemplate(sectionKey, filtered) : ''}

      <section class="section-block">
        <div class="section-head">
          <div>
            <div class="eyebrow">${sectionKey ? `${sectionIcon(sectionKey)} ${escapeHtml(title)}` : escapeHtml(title)}</div>
            <h3>${escapeHtml(title)}</h3>
          </div>
          <div class="section-tools">
            <button class="ghost-btn small" data-route="#/home">الرئيسية</button>
          </div>
        </div>

        ${renderRecentSearches()}
        ${renderCategoryChips(filtered)}
        ${activeFiltersSummary(filtered)}

        ${filtered.length
          ? `<div class="content-grid">${filtered.map(cardTemplate).join('')}</div>`
          : `<div class="empty-state glass-card">لا توجد عناصر متاحة.</div>`}
      </section>
    `;
  };

  const settingsTemplate = () => {
    return `
      <section class="section-block">
        <div class="section-head"><h3>الإعدادات</h3></div>
        <div class="settings-card glass-card">
          <label>المظهر</label>
          <div class="chip-row">
            ${['auto', 'light', 'dark'].map(theme => `
              <button class="chip ${state.theme === theme ? 'active' : ''}" data-theme="${theme}">
                ${theme === 'auto' ? 'تلقائي' : theme === 'light' ? 'فاتح' : 'داكن'}
              </button>
            `).join('')}
          </div>

          <label>حجم الخط</label>
          <div class="chip-row">
            ${[0.9, 1, 1.1, 1.2, 1.3].map(size => `
              <button class="chip ${state.textScale === size ? 'active' : ''}" data-scale="${size}">
                ${size}x
              </button>
            `).join('')}
          </div>

          ${renderRecentSearches()}

          <div class="settings-meta">
            <p>عنوان الموقع: ${escapeHtml(state.appState?.siteTitle || APP.DEFAULT_TITLE)}</p>
            <p>آخر مزامنة: ${escapeHtml(state.appState?.lastSync || '-')}</p>
            <p>إصدار التطبيق: ${escapeHtml(state.appState?.appVersion || '-')}</p>
          </div>

          <div class="hero-actions">
            <button class="primary-btn" data-sync-now="1">تنفيذ مزامنة</button>
            <button class="ghost-btn" data-clear-history="1">مسح السجل</button>
            <button class="ghost-btn" data-route="#/downloads">التنزيلات</button>
            <button class="ghost-btn" data-route="#/mirror?mode=pages">أرشيف الصفحات</button>
          </div>
        </div>
      </section>
    `;
  };

  const mirrorTemplate = (mode = 'opened') => {
    const source = mode === 'pages'
      ? normalizeMirrorList(state.siteMirror.pages)
      : mode === 'media'
      ? normalizeMirrorList(state.siteMirror.media)
      : normalizeMirrorList(state.siteMirror.opened);

    const title = mode === 'pages'
      ? 'أرشيف الصفحات المحفوظة'
      : mode === 'media'
      ? 'الوسائط المحفوظة'
      : 'المحفوظ من نسخة الموقع';

    const filtered = source.filter(item => {
      const q = state.query.trim().toLowerCase();
      if (!q) return true;
      return [item.title, item.url, item.kind, item.excerpt, item.family, item.name]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });

    return `
      <section class="section-block glass-card">
        <div class="section-head">
          <h3>${escapeHtml(title)}</h3>
          <span class="results-strip">${filtered.length} عنصر</span>
        </div>

        ${filtered.length ? `
          <div class="content-grid related-grid">
            ${filtered.map(item => `
              <article class="content-card mirror-card">
                <div class="content-meta">${escapeHtml(item.kind || item.family || 'page')}</div>
                <h3>${escapeHtml(item.title || item.name || item.url || 'محتوى محفوظ')}</h3>
                <p>${escapeHtml(item.excerpt || item.url || '')}</p>
                <div class="card-actions">
                  ${mode === 'pages' ? `<button class="ghost-btn small" data-open-archive="${safeAttr(item.url || '')}">فتح المحفوظ</button>` : ''}
                  <button class="ghost-btn small" data-open-url="${safeAttr(item.url || '')}">فتح الرابط</button>
                  <button class="ghost-btn small" data-copy-url="${safeAttr(item.url || '')}">نسخ الرابط</button>
                </div>
              </article>
            `).join('')}
          </div>
        ` : `
          <div class="empty-state glass-card">لا يوجد محتوى مؤرشف داخل التطبيق حتى الآن.</div>
        `}
      </section>
    `;
  };

  /* ==========================================================================
     واجهة المستخدم العامة
     ========================================================================== */
  const searchPlaceholder = () => {
    const route = routeInfo();
    if (route.view === 'section') return `ابحث داخل ${sectionTitle(route.section)}...`;
    if (route.view === 'favorites') return 'ابحث داخل المحفوظات...';
    if (route.view === 'history') return 'ابحث داخل سجل القراءة...';
    return 'ابحث في كامل المحتوى المحفوظ...';
  };

  const updateSearchUi = () => {
    const input = $('#globalSearchInput');
    if (!input) return;
    input.placeholder = searchPlaceholder();
    if (input.value !== state.query) input.value = state.query;
  };

  const setTheme = (theme) => {
    state.theme = theme;
    Storage.setText(APP.STORAGE_KEYS.theme, theme);
    document.documentElement.dataset.theme = theme;
  };

  const applyBranding = () => {
    const title = state.appState?.siteTitle || APP.DEFAULT_TITLE;
    $('#siteTitle').textContent = title;

    const logo = state.appState?.logoUrl || '';
    const logoEl = $('#siteLogo');
    const fallback = $('#brandFallback');

    if (logo) {
      logoEl.src = logo;
      logoEl.classList.remove('hidden');
      fallback.classList.add('hidden');
    } else {
      logoEl.classList.add('hidden');
      fallback.classList.remove('hidden');
    }
  };

  const applyThemeColors = () => {
    const theme = state.appState?.theme || {};
    const root = document.documentElement;

    const map = {
      '--brand-primary': theme.primary,
      '--brand-primary-dark': theme.primaryDark,
      '--brand-accent': theme.accent,
      '--brand-bg': theme.background,
      '--brand-surface': theme.surface,
      '--brand-text': theme.text,
      '--brand-muted': theme.muted
    };

    Object.entries(map).forEach(([k, v]) => {
      if (v) root.style.setProperty(k, v);
    });
  };

  const renderSyncInfo = () => {
    const el = $('#syncInfo');
    const stamp = state.appState?.lastSync;
    const counts = state.appState?.sectionCounts || {};
    const total = Object.values(counts).reduce((a, b) => a + Number(b || 0), 0);
    el.textContent = stamp ? `آخر مزامنة: ${stamp} • ${total} عنصر محفوظ` : 'لم تتم مزامنة بعد';
  };

  const renderNavigation = () => {
    const tabs = $('#tabs');
    const dock = $('#bottomDock');
    const route = routeInfo();

    const items = [
      { key: 'home', label: state.labels.home, hash: '#/home' },
      { key: 'posts', label: state.labels.posts, hash: '#/section?name=posts' },
      { key: 'fatwas', label: state.labels.fatwas, hash: '#/section?name=fatwas' },
      { key: 'books', label: state.labels.books, hash: '#/section?name=books' },
      { key: 'downloads', label: state.labels.downloads, hash: '#/downloads' },
      { key: 'mirror', label: state.labels.mirror, hash: '#/mirror?mode=pages' },
      { key: 'favorites', label: state.labels.favorites, hash: '#/favorites' },
      { key: 'settings', label: state.labels.settings, hash: '#/settings' }
    ];

    const currentKey = route.view === 'section' ? route.section : route.view;

    tabs.innerHTML = items.map(item => `
      <button class="tab-btn ${currentKey === item.key ? 'active' : ''}" data-route="${item.hash}">
        ${escapeHtml(item.label)}
      </button>
    `).join('');

    dock.innerHTML = [items[0], items[2], items[3], items[4], items[6], items[7]].map(item => `
      <button class="dock-btn ${currentKey === item.key ? 'active' : ''}" data-route="${item.hash}">
        ${escapeHtml(item.label)}
      </button>
    `).join('');
  };

  const renderSearchAssist = () => {
    const mount = $('#searchAssist');
    if (!mount) return;

    const items = scopedItemsForSuggestions();
    const suggestions = searchSuggestions(items, state.query);
    const typeChips = renderTypeChips(items);
    const recent = renderRecentSearches();

    const hasUi = suggestions.length || typeChips || state.recentSearches.length;
    if (!hasUi) {
      mount.innerHTML = '';
      return;
    }

    mount.innerHTML = `
      ${typeChips ? `<div class="search-panel glass-card"><h4>تصفية حسب النوع</h4>${typeChips}</div>` : ''}
      ${suggestions.length ? `
        <div class="search-panel glass-card">
          <h4>اقتراحات بحث</h4>
          <div class="search-grid">
            ${suggestions.map(s => `
              <button class="chip search-suggestion" data-search-term="${safeAttr(s.label)}">
                ${escapeHtml(s.label)}
                ${s.meta ? `<small>${escapeHtml(s.meta)}</small>` : ''}
              </button>
            `).join('')}
          </div>
        </div>
      ` : ''}
      ${recent ? `<div class="search-panel glass-card"><h4>عمليات بحث سابقة</h4>${recent}</div>` : ''}
    `;
  };

  /* ==========================================================================
     تحميل البيانات
     ========================================================================== */
  const loadMirrorState = async () => {
    state.siteMirror.summary = await Api.fetchJson('mirror/summary.json') || await Api.fetchJson('mirror/manifest.json');
    state.siteMirror.opened = await Api.fetchJson('mirror/opened.json') || [];
    state.siteMirror.pages = await Api.fetchJson('mirror/pages.json') || [];
    state.siteMirror.media = await Api.fetchJson('mirror/media.json') || [];
  };

  const loadBundle = async () => {
    updateSearchUi();

    state.appState = await Api.fetchJson('app-state.json');
    await loadMirrorState();

    const sectionList = (state.appState?.sections || []).map(s => s.key).filter(Boolean);
    state.sections = sectionList.filter(key => !['home', 'favorites', 'history', 'settings'].includes(key));

    for (const section of state.sections) {
      state.data[section] = await Api.fetchJson(`content/${section}.json`) || { items: [] };
    }

    applyBranding();
    applyThemeColors();
    setTheme(state.theme);
    saveTextScale();
    render();
  };

  /* ==========================================================================
     الفتح والمشاركة
     ========================================================================== */
  const siteBaseUrl = () => state.appState?.siteUrl || 'https://alorwahalwuthqa.net';

  const liveSectionUrl = (section) => {
    const base = siteBaseUrl();
    const map = {
      books: '/library.php',
      fatwas: '/fatwa.php',
      posts: '/about-zaydiyah.php',
      news: '/',
      audios: '/library-audio.php',
      videos: '/library-video.php'
    };
    return `${base}${map[section] || '/'}`;
  };

  const liveUrlForItem = (item) => {
    if (!item) return siteBaseUrl();
    if (item.url) return item.url;
    if (item.fileUrl) return item.fileUrl;

    const base = siteBaseUrl();
    if (item.type === 'books') return item.slug ? `${base}/book-details.php?slug=${encodeURIComponent(item.slug)}` : `${base}/book-details.php?id=${item.id}`;
    if (item.type === 'fatwas') return item.slug ? `${base}/fatwa-details.php?slug=${encodeURIComponent(item.slug)}` : `${base}/fatwa-details.php?id=${item.id}`;
    if (item.type === 'posts') return item.slug ? `${base}/post-details.php?slug=${encodeURIComponent(item.slug)}` : `${base}/about-zaydiyah.php?post=${item.id}`;
    return liveSectionUrl(item.type);
  };

  const openResourceInApp = (item) => {
    if (!item) return false;

    const fileUrl = String(item.fileUrl || '').trim();
    const sourceUrl = String(item.url || '').trim();
    const target = fileUrl || sourceUrl;
    if (!target) return false;

    const lower = target.toLowerCase();

    if ((item.type === 'books' || /\.(pdf|epub|docx?)(\?|$)/.test(lower))) {
      if (window.AndroidBridge?.openBookViewer) {
        Bridge.openBookViewer(target, item.title || 'عارض الملف');
        return true;
      }
    }

    if ((item.type === 'audios' || /\.(mp3|m4a|wav|ogg)(\?|$)/.test(lower))) {
      if (window.AndroidBridge?.openMediaViewer) {
        Bridge.openMediaViewer(target, item.title || 'مشغل صوتي', 'audio');
        return true;
      }
    }

    if ((item.type === 'videos' || /\.(mp4|m3u8|webm|mov)(\?|$)/.test(lower))) {
      if (window.AndroidBridge?.openMediaViewer) {
        Bridge.openMediaViewer(target, item.title || 'مشغل فيديو', 'video');
        return true;
      }
    }

    return false;
  };

  const openContentResource = (item) => {
    if (!item) return;
    const target = String(item.fileUrl || item.url || '').trim();
    if (!target) return;

    if (openResourceInApp(item)) return;

    const lower = target.toLowerCase();
    const isDownloadable =
      /\.(pdf|epub|docx?|xlsx?|pptx?|zip|rar)(\?|$)/.test(lower) ||
      /download|file=|attachment/.test(lower);

    if (item.fileUrl && isDownloadable && window.AndroidBridge?.downloadFile) {
      Bridge.downloadFile(item.fileUrl, (item.title || 'alorwaha-file').replace(/[\/:*?"<>|]+/g, '-'));
      return;
    }

    Bridge.openExternal(target);
  };

  /* ==========================================================================
     التصيير
     ========================================================================== */
  const renderHome = (feed = '') => {
    $('#viewRoot').innerHTML = homeTemplate(feed);
  };

  const renderCollection = (title, items, sectionKey = '') => {
    $('#viewRoot').innerHTML = collectionTemplate(title, items, sectionKey);
  };

  const renderSectionLike = (section) => {
    if (section === 'favorites') {
      const items = [...state.favorites].map(findItemFromKey).filter(Boolean);
      renderCollection('المحفوظات', items);
      return;
    }
    renderCollection(sectionTitle(section), listForSection(section), section);
  };

  const renderHistory = () => {
    const items = state.history.map(findItemFromKey).filter(Boolean);
    renderCollection('سجل القراءة', items);
  };

  const renderDownloads = () => {
    const items = getFilteredItems(getAllItems().filter(item => String(item.fileUrl || '').trim()));
    $('#viewRoot').innerHTML = collectionTemplate('التنزيلات', items, 'downloads');
  };

  const renderMirrorCollection = (mode) => {
    $('#viewRoot').innerHTML = mirrorTemplate(mode);
  };

  const renderSettings = () => {
    $('#viewRoot').innerHTML = settingsTemplate();
  };

  const renderDetail = (type, id) => {
    const item = listForSection(type).find(entry => String(entry.id) === String(id));
    if (!item) {
      $('#viewRoot').innerHTML = '<div class="empty-state glass-card">لم يتم العثور على العنصر المطلوب.</div>';
      return;
    }
    rememberItem(item);
    $('#viewRoot').innerHTML = detailTemplate(item);
  };

  const doRender = () => {
    renderNavigation();
    renderSyncInfo();
    updateSearchUi();
    renderSearchAssist();

    const route = routeInfo();
    if (route.category) state.selectedCategory = route.category;

    switch (route.view) {
      case 'detail':
        renderDetail(route.type, route.id);
        break;
      case 'favorites':
        renderSectionLike('favorites');
        break;
      case 'history':
        renderHistory();
        break;
      case 'downloads':
        renderDownloads();
        break;
      case 'mirror':
        renderMirrorCollection(route.mode || 'opened');
        break;
      case 'settings':
        renderSettings();
        break;
      case 'section':
        renderSectionLike(route.section);
        break;
      default:
        renderHome(route.feed);
    }
  };

  const render = debounce(doRender, 40);

  /* ==========================================================================
     إدارة الأحداث
     ========================================================================== */
  document.addEventListener('click', (event) => {
    const target = event.target.closest('button, [data-route], [data-open-url], [data-open-archive], [data-copy-url]');
    if (!target) return;

    if (target.matches('#nativeSyncBtn,[data-sync-now]')) {
      Bridge.syncNow();
      return;
    }

    if (target.matches('#reloadBtn')) {
      loadBundle();
      return;
    }

    if (target.matches('#clearSearchBtn')) {
      state.query = '';
      state.selectedCategory = 'all';
      state.activeType = 'all';
      const input = $('#globalSearchInput');
      if (input) input.value = '';
      render();
      return;
    }

    const route = target.getAttribute('data-route');
    if (route) {
      setRoute(route);
      return;
    }

    const favorite = target.getAttribute('data-favorite');
    if (favorite) {
      const item = findItemFromKey(favorite);
      if (item) {
        toggleFavorite(item);
        render();
      }
      return;
    }

    const resourceKey = target.getAttribute('data-resource-key');
    if (resourceKey) {
      const item = findItemFromKey(resourceKey);
      if (item) openContentResource(item);
      return;
    }

    const category = target.getAttribute('data-category');
    if (category !== null) {
      state.selectedCategory = category;
      render();
      return;
    }

    const type = target.getAttribute('data-type');
    if (type !== null) {
      state.activeType = type;
      render();
      return;
    }

    const term = target.getAttribute('data-search-term');
    if (term !== null) {
      state.query = term;
      updateSearchUi();
      render();
      return;
    }

    const clearFilter = target.getAttribute('data-clear-filter');
    if (clearFilter) {
      if (clearFilter === 'query') state.query = '';
      if (clearFilter === 'category') state.selectedCategory = 'all';
      if (clearFilter === 'type') state.activeType = 'all';
      updateSearchUi();
      render();
      return;
    }

    const theme = target.getAttribute('data-theme');
    if (theme) {
      setTheme(theme);
      render();
      return;
    }

    const scale = target.getAttribute('data-scale');
    if (scale) {
      state.textScale = Number(scale);
      saveTextScale();
      render();
      return;
    }

    const scaleAction = target.getAttribute('data-scale-action');
    if (scaleAction) {
      if (scaleAction === 'plus') state.textScale = Math.min(1.5, +(state.textScale + 0.1).toFixed(1));
      if (scaleAction === 'minus') state.textScale = Math.max(0.9, +(state.textScale - 0.1).toFixed(1));
      saveTextScale();
      return;
    }

    const shareKey = target.getAttribute('data-share-item');
    if (shareKey) {
      const item = findItemFromKey(shareKey);
      if (item) Bridge.shareText(item.title || '', item.url || item.fileUrl || '');
      return;
    }

    const copyKey = target.getAttribute('data-copy-item');
    if (copyKey) {
      const item = findItemFromKey(copyKey);
      if (item) Bridge.copyText(item.url || item.fileUrl || item.title || '');
      return;
    }

    if (target.matches('[data-clear-history]')) {
      state.history = [];
      saveHistory();
      render();
      return;
    }

    const openUrl = target.getAttribute('data-open-url');
    if (openUrl) {
      Bridge.openExternal(openUrl);
      return;
    }

    const archiveUrl = target.getAttribute('data-open-archive');
    if (archiveUrl) {
      Bridge.openSavedArchive(archiveUrl);
      return;
    }

    const copyUrl = target.getAttribute('data-copy-url');
    if (copyUrl) {
      Bridge.copyText(copyUrl);
    }
  });

  const onSearchInput = debounce((value) => {
    state.query = value || '';
    render();
  }, 70);

  $('#globalSearchInput')?.addEventListener('input', (e) => {
    onSearchInput(e.target.value);
  });

  $('#globalSearchInput')?.addEventListener('change', (e) => {
    rememberSearch(e.target.value || '');
  });

  $('#globalSearchInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') rememberSearch(e.target.value || '');
  });

  window.addEventListener('hashchange', () => {
    persistLastRoute();
    render();
  });

  /* ==========================================================================
     التهيئة
     ========================================================================== */
  window[APP.NAME] = {
    reloadFromAndroid: loadBundle,
    openInWebView: (url) => { if (url) window.location.href = url; }
  };

  if (!restoreLastRoute()) persistLastRoute();
  loadBundle();
})();