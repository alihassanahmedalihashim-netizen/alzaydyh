/**
 * fatwa-audio.js – صفحة الفتاوى الصوتية
 */
(function() {
    const CATEGORY_NAMES = [
        'كل الملفات', 'أخرى', 'الوديعة', 'الهبة', 'النكاح', 'النفقة',
        'اللقطة', 'الشراكة', 'الغصب', 'الرهن', 'الرضاع', 'الحضانة',
        'الأمر بالمعروف والنهي عن المنكر', 'الجنائز', 'فتاوى في الارحام', 'فتاوى ادعية'
    ];

    let folderIds = {};
    let currentCategory = 'كل الملفات';
    let allFiles = [];
    let displayCount = 0;

    const categoriesScroll = document.getElementById('audioCategoriesScroll');
    const audioContainer = document.getElementById('audioListContainer');
    const loadMoreBtn = document.getElementById('loadMoreBtn');

    if (!categoriesScroll || !audioContainer) return;

    // جلب معرف مجلد فرعي بالاسم
    async function getFolderIdByName(name) {
        if (name === 'كل الملفات') return CONFIG.AUDIO_ROOT_FOLDER_ID;
        try {
            const query = encodeURIComponent(`name='${name}' and '${CONFIG.AUDIO_ROOT_FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
            const url = `https://www.googleapis.com/drive/v3/files?q=${query}&key=${CONFIG.GOOGLE_DRIVE_API_KEY}&fields=files(id)`;
            const res = await fetch(url);
            const data = await res.json();
            return data.files?.[0]?.id || null;
        } catch {
            return null;
        }
    }

    // جلب معرفات جميع المجلدات
    async function fetchAllFolderIds() {
        const promises = CATEGORY_NAMES.map(async name => ({ name, id: await getFolderIdByName(name) }));
        const results = await Promise.all(promises);
        results.forEach(({ name, id }) => { folderIds[name] = id; });
    }

    // إنشاء أزرار التصنيفات
    function renderCategoryButtons() {
        categoriesScroll.innerHTML = CATEGORY_NAMES.map(name => `
            <button class="audio-category-btn" data-category="${name}">${name}</button>
        `).join('');
        document.querySelectorAll('.audio-category-btn').forEach(btn => {
            btn.addEventListener('click', () => onCategoryClick(btn.dataset.category));
        });
        const defaultBtn = document.querySelector('[data-category="كل الملفات"]');
        defaultBtn?.classList.add('active');
    }

    // جلب الملفات الصوتية من مجلد معين
    async function fetchAudioFiles(folderId) {
        if (!folderId) return [];
        try {
            const query = encodeURIComponent(`'${folderId}' in parents and mimeType contains 'audio/' and trashed=false`);
            const url = `https://www.googleapis.com/drive/v3/files?q=${query}&key=${CONFIG.GOOGLE_DRIVE_API_KEY}&fields=files(id,name,mimeType,size)&orderBy=name`;
            const res = await fetch(url);
            const data = await res.json();
            return data.files || [];
        } catch {
            return [];
        }
    }

    // جلب جميع الملفات من جميع المجلدات
    async function fetchAllAudioFiles() {
        const folderIdList = Object.values(folderIds).filter(Boolean);
        if (folderIdList.length === 0) return [];
        const filesArrays = await Promise.all(folderIdList.map(id => fetchAudioFiles(id)));
        const map = new Map();
        filesArrays.flat().forEach(file => map.set(file.id, file));
        return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'ar'));
    }

    // عرض الملفات الحالية
    function displayFiles() {
        const filesToShow = allFiles.slice(0, displayCount);

        if (filesToShow.length === 0) {
            audioContainer.innerHTML = `<div class="empty-folder"><i class="fas fa-folder-open"></i> لا توجد ملفات صوتية</div>`;
            if (loadMoreBtn) loadMoreBtn.style.display = 'none';
            return;
        }

        audioContainer.innerHTML = filesToShow.map(file => {
            const src = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media&key=${CONFIG.GOOGLE_DRIVE_API_KEY}`;
            const size = file.size ? ` (${formatSize(file.size)})` : '';
            return `
                <div class="audio-item">
                    <div class="audio-name" title="${file.name}">${file.name} <span class="audio-size">${size}</span></div>
                    <audio controls preload="none">
                        <source src="${src}" type="${file.mimeType}">
                        متصفحك لا يدعم التشغيل.
                    </audio>
                </div>
            `;
        }).join('');

        if (loadMoreBtn) {
            loadMoreBtn.style.display = displayCount >= allFiles.length ? 'none' : 'block';
        }
    }

    // تحميل المزيد
    function loadMore() {
        displayCount = Math.min(displayCount + CONFIG.AUDIO_PAGE_SIZE, allFiles.length);
        displayFiles();
    }

    // عند اختيار تصنيف
    async function onCategoryClick(category) {
        document.querySelectorAll('.audio-category-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelector(`[data-category="${category}"]`)?.classList.add('active');

        currentCategory = category;
        displayCount = 0;
        showLoading(audioContainer, 'جاري تحميل المقاطع...');
        if (loadMoreBtn) loadMoreBtn.style.display = 'none';

        if (category === 'كل الملفات') {
            allFiles = await fetchAllAudioFiles();
        } else {
            const folderId = folderIds[category];
            if (!folderId) {
                audioContainer.innerHTML = `<div class="empty-folder"><i class="fas fa-exclamation-triangle"></i> التصنيف "${category}" غير متاح</div>`;
                return;
            }
            allFiles = await fetchAudioFiles(folderId);
        }

        displayCount = Math.min(CONFIG.AUDIO_PAGE_SIZE, allFiles.length);
        displayFiles();
    }

    // التهيئة
    window.initAudioFatwaPage = async function() {
        renderCategoryButtons();
        await fetchAllFolderIds();
        if (loadMoreBtn) {
            loadMoreBtn.addEventListener('click', loadMore);
        }
        await onCategoryClick('كل الملفات');
    };
})();