/**
 * main.js – الملف الرئيسي لمنصة الزيدية العلمية
 * يحتوي على الدوال المشتركة وإدارة التوجيه للصفحات الفرعية
 * @version 3.0
 */

// ==================== الإعدادات العامة ====================
const CONFIG = {
    YOUTUBE_API_KEY: 'AIzaSyCb2q3nTzsE624UqYU6XqNYs9x0eygTaRM',
    YOUTUBE_CHANNEL_ID: 'UCRhcbj7lBJ7RFj6RPsgLGDA',
    GOOGLE_DRIVE_API_KEY: 'AIzaSyCb2q3nTzsE624UqYU6XqNYs9x0eygTaRM',
    AUDIO_ROOT_FOLDER_ID: '1CLqtpw61lqK8YP3IuJFX4CWClcOSqkrr',
    LIBRARY_FOLDER_ID: '1w9NUWzkpXHvdoOTin5gyZak0sb54jXP-',
    CACHE_EXPIRY: 10 * 60 * 1000, // 10 دقائق
    DEBOUNCE_DELAY: 300,
    AUDIO_PAGE_SIZE: 7,
    SLIDER_INTERVAL: 5000
};

// ==================== الدوال المساعدة العامة ====================
async function fetchWithTimeout(url, options = {}, timeout = 10000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(id);
        return response;
    } catch (error) {
        clearTimeout(id);
        throw error;
    }
}

function getErrorMessage(error) {
    if (error.name === 'AbortError') return 'انتهت مهلة الاتصال، تحقق من اتصالك.';
    if (error.message.includes('HTTP error 403')) return 'مشكلة في مفتاح API، يرجى التحقق.';
    if (error.message.includes('Failed to fetch')) return 'تعذر الاتصال بالخادم.';
    return error.message || 'حدث خطأ غير متوقع';
}

function showError(container, message) {
    if (container) {
        container.innerHTML = `<div class="error-message"><i class="fas fa-exclamation-circle"></i> ${message}</div>`;
    }
}

function showLoading(container, text = 'جار التحميل...') {
    if (container) {
        container.innerHTML = `<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> ${text}</div>`;
    }
}

function formatSize(bytes) {
    if (!bytes) return 'N/A';
    const units = ['بايت', 'ك.ب', 'م.ب', 'ج.ب'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + units[i];
}

function generatePlaceholder(text) {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 600;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#016fae';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'white';
    ctx.font = 'bold 40px Tajawal';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text.substring(0, 10), canvas.width / 2, canvas.height / 2);
    return canvas.toDataURL();
}

function copyToClipboard(text) {
    navigator.clipboard?.writeText(text).then(() => {
        showToast('تم النسخ', 'success');
    }).catch(() => {
        alert('تعذر النسخ، يمكنك النسخ يدويًا');
    });
}

function showToast(message, type = 'success') {
    let container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    const id = 'toast_' + Date.now() + Math.random();
    const html = `
        <div id="${id}" class="toast-message toast-${type}" role="alert">
            <i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-circle'}"></i>
            <span>${message}</span>
            <button class="toast-close" onclick="this.parentElement.remove()">&times;</button>
        </div>
    `;
    container.insertAdjacentHTML('beforeend', html);
    setTimeout(() => {
        const el = document.getElementById(id);
        if (el) el.remove();
    }, 4000);
}

function debounce(fn, delay) {
    let timer;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

function throttle(fn, limit) {
    let inThrottle;
    return function (...args) {
        if (!inThrottle) {
            fn.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

function setWithExpiry(key, value, ttl) {
    const now = Date.now();
    const item = { value, expiry: now + ttl };
    localStorage.setItem(key, JSON.stringify(item));
}

function getWithExpiry(key) {
    const itemStr = localStorage.getItem(key);
    if (!itemStr) return null;
    try {
        const item = JSON.parse(itemStr);
        if (Date.now() > item.expiry) {
            localStorage.removeItem(key);
            return null;
        }
        return item.value;
    } catch {
        return null;
    }
}

// ==================== دوال مشتركة للواجهة ====================
function initHeader() {
    const hamburger = document.getElementById('hamburgerBtn');
    const navMenu = document.getElementById('navMenu');
    const overlay = document.getElementById('overlay');
    const closeBtn = document.getElementById('closeMenuBtn');
    const dropdownToggles = document.querySelectorAll('.dropdown-toggle');
    const navLinks = document.querySelectorAll('.nav-btn:not(.dropdown-toggle)');

    if (!navMenu) return;

    if (closeBtn && navMenu.firstChild !== closeBtn) {
        navMenu.prepend(closeBtn);
    }

    function toggleMenu(force) {
        navMenu.classList.toggle('active', force);
        overlay?.classList.toggle('active', force);
        document.body.style.overflow = navMenu.classList.contains('active') ? 'hidden' : '';
    }

    hamburger?.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleMenu(true);
    });

    closeBtn?.addEventListener('click', () => toggleMenu(false));
    overlay?.addEventListener('click', () => toggleMenu(false));

    navLinks.forEach(link => {
        link.addEventListener('click', () => {
            if (window.innerWidth <= 768) toggleMenu(false);
        });
    });

    if (window.innerWidth <= 768) {
        dropdownToggles.forEach(toggle => {
            toggle.addEventListener('click', (e) => {
                e.preventDefault();
                const dropdown = toggle.closest('.dropdown');
                dropdown?.classList.toggle('active');
            });
        });
    }

    window.addEventListener('resize', () => {
        if (window.innerWidth > 768) {
            document.querySelectorAll('.dropdown').forEach(d => d.classList.remove('active'));
            toggleMenu(false);
        }
    });

    document.querySelectorAll('a[href="javascript:void(0)"]').forEach(link => {
        link.addEventListener('click', (e) => e.preventDefault());
    });
}

function initBackToTop() {
    const btn = document.getElementById('backToTop');
    if (!btn) return;

    const toggleBtn = throttle(() => {
        btn.style.display = window.scrollY > 300 ? 'flex' : 'none';
    }, 200);

    window.addEventListener('scroll', toggleBtn);
    btn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
}

function initTheme() {
    const themeToggle = document.getElementById('themeToggle');
    if (!themeToggle) return;

    const savedTheme = localStorage.getItem('theme') || 'light';
    document.body.setAttribute('data-theme', savedTheme);
    themeToggle.innerHTML = savedTheme === 'dark' ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';

    themeToggle.addEventListener('click', () => {
        const current = document.body.getAttribute('data-theme');
        const target = current === 'dark' ? 'light' : 'dark';
        document.body.setAttribute('data-theme', target);
        localStorage.setItem('theme', target);
        themeToggle.innerHTML = target === 'dark' ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
    });
}

// ==================== تحميل الصفحات الفرعية ديناميكيًا ====================
function loadScript(url, callback) {
    const script = document.createElement('script');
    script.src = url;
    script.onload = callback;
    script.onerror = () => console.error('فشل تحميل:', url);
    document.head.appendChild(script);
}
/**
 * main.js – الملف الرئيسي لمنصة الزيدية العلمية
 * @version 3.1
 */
// ... باقي الكود كما هو ...

function initPage() {
    initHeader();
    initBackToTop();
    initTheme();

    if (document.getElementById('fatwaGrid')) {
        loadScript('fatwa/fatwa.js', () => window.initFatwaPage?.());
    } else if (document.getElementById('audioListContainer')) {
        loadScript('fatwa/fatwa-audio.js', () => window.initAudioFatwaPage?.());
    } else if (document.getElementById('booksGrid')) {
        loadScript('library/library.js', () => window.initEliteLibraryPage?.());
    } else if (document.getElementById('playlists-grid')) {
        loadScript('library/video-library.js', () => window.initVideoLibraryPage?.());
    } else if (document.querySelector('.levels-container')) {
        loadScript('levels/levels.js', () => window.initLevelsPage?.());
    } else if (document.getElementById('videoTrack')) {
        loadScript('home/index.js', () => window.initIndexPage?.());
    } else if (document.getElementById('chatArea')) {
        loadScript('discussion/discussion.js', () => window.initDiscussionPage?.());
    } else if (document.getElementById('researchList')) {
        loadScript('research/research.js', () => window.initResearchPage?.());
    } else if (document.querySelector('.article-card')) {
        loadScript('about/about-zaydiyah.js', () => window.initAboutZaydiyahPage?.()); // ✅ تم التصحيح
    } else if (document.querySelector('.page-header') && window.location.pathname.includes('about.html')) {
        loadScript('about/about.js', () => window.initAboutPage?.());
    }
}

document.addEventListener('DOMContentLoaded', initPage);