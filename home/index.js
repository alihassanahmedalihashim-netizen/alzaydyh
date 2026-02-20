/**
 * index.js – الصفحة الرئيسية (نسخة متكاملة مع جلب الكتب من المجلدات الفرعية)
 * تم تعديل شكل بطاقة الكتاب إلى أيقونة + عنوان + أزرار عرض وتحميل
 */
(function() {
    // شريط التمرير الذهبي
    const marqueeInner = document.getElementById('marquee-inner');
    if (marqueeInner) {
        marqueeInner.innerHTML += marqueeInner.innerHTML; // تكرار المحتوى
    }

    // زر "اقرأ المزيد"
    const readMoreBtn = document.getElementById('readMoreBtn');
    const extraContent = document.getElementById('extraContent');
    if (readMoreBtn && extraContent) {
        readMoreBtn.addEventListener('click', () => {
            const isHidden = !extraContent.classList.contains('show');
            extraContent.classList.toggle('show', isHidden);
            readMoreBtn.innerHTML = isHidden ? '<i class="fas fa-chevron-up"></i> اقرأ أقل' : '<i class="fas fa-chevron-down"></i> اقرأ المزيد';
        });
    }

    // معرف مجلد الكتب الرئيسي في Google Drive
    const DRIVE_BOOKS_FOLDER_ID = '1uz7TxlwSgIG3E3aC70Ly89z5F1fFIcu7';

    /**
     * جلب جميع الملفات من مجلد معين وجميع المجلدات الفرعية (متكرر)
     * @param {string} folderId - معرف المجلد
     * @param {Array} accumulatedFiles - المصفوفة التراكمية للملفات
     * @param {string|null} pageToken - رمز الصفحة للترحيل
     * @returns {Promise<Array>} - قائمة بجميع الملفات (غير المجلدات)
     */
    async function getAllFilesInFolderRecursively(folderId, accumulatedFiles = [], pageToken = null) {
        // استعلام لجلب الملفات والمجلدات الفرعية المباشرة
        const query = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
        let url = `https://www.googleapis.com/drive/v3/files?q=${query}&key=${CONFIG.YOUTUBE_API_KEY}&fields=files(id,name,thumbnailLink,size,mimeType,modifiedTime,webViewLink,mimeType),nextPageToken`;
        if (pageToken) {
            url += `&pageToken=${pageToken}`;
        }

        const response = await fetchWithTimeout(url, {}, 10000);
        if (!response.ok) {
            throw new Error(`HTTP error ${response.status}`);
        }

        const data = await response.json();
        const items = data.files || [];

        // فصل المجلدات عن الملفات العادية
        const folders = items.filter(f => f.mimeType === 'application/vnd.google-apps.folder');
        const files = items.filter(f => f.mimeType !== 'application/vnd.google-apps.folder');

        // إضافة الملفات إلى القائمة التراكمية
        accumulatedFiles.push(...files);

        // إذا كان هناك صفحة تالية، نكمل بنفس المجلد
        if (data.nextPageToken) {
            await getAllFilesInFolderRecursively(folderId, accumulatedFiles, data.nextPageToken);
        }

        // معالجة المجلدات الفرعية بشكل متكرر
        for (const folder of folders) {
            await getAllFilesInFolderRecursively(folder.id, accumulatedFiles);
        }

        return accumulatedFiles;
    }

    /**
     * دالة مساعدة لتحديد الأيقونة حسب نوع الملف
     */
    function getBookIcon(mimeType) {
        if (mimeType?.includes('pdf')) return '📕';
        if (mimeType?.includes('epub')) return '📘';
        if (mimeType?.includes('document')) return '📗';
        return '📖';
    }

    /**
     * جلب الكتب من Google Drive (بما في ذلك المجلدات الفرعية) وعرضها في السلايدر
     */
    async function fetchBooksFromDrive() {
        const track = document.getElementById('booksTrack');
        if (!track) return;

        track.innerHTML = '<div class="loading-spinner" style="text-align:center; padding:40px;"><i class="fas fa-spinner fa-spin"></i> جاري تحميل الكتب...</div>';

        try {
            // جلب جميع الملفات من المجلد الرئيسي وجميع المجلدات الفرعية
            const allFiles = await getAllFilesInFolderRecursively(DRIVE_BOOKS_FOLDER_ID);

            if (allFiles.length === 0) {
                track.innerHTML = '<div class="error-message"><i class="fas fa-exclamation-circle"></i> لا توجد كتب في هذا المجلد</div>';
                return;
            }

            // بناء بطاقات الكتب بالشكل الجديد
            track.innerHTML = '';
            allFiles.forEach(file => {
                const card = document.createElement('div');
                card.className = 'card-single';

                // تحديد الأيقونة
                const iconChar = getBookIcon(file.mimeType);

                // روابط العرض والتحميل
                const viewUrl = file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`;
                const downloadUrl = `https://drive.google.com/uc?export=download&id=${file.id}`;

                card.innerHTML = `
                    <div class="book-icon">${iconChar}</div>
                    <div class="book-title">${file.name || 'بدون عنوان'}</div>
                    <div class="buttons">
                        <a href="${viewUrl}" target="_blank" class="btn btn-view">عرض</a>
                        <a href="${downloadUrl}" target="_blank" class="btn btn-download">تحميل</a>
                    </div>
                `;
                track.appendChild(card);
            });

        } catch (error) {
            console.error('فشل جلب الكتب:', error);
            track.innerHTML = `<div class="error-message"><i class="fas fa-exclamation-circle"></i> ${getErrorMessage(error)}</div>`;
        }
    }

    async function fetchYouTubeVideos() {
        const track = document.getElementById('videoTrack');
        if (!track) return;
        track.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> جاري تحميل الفيديوهات...</div>';

        try {
            const channelUrl = `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${CONFIG.YOUTUBE_CHANNEL_ID}&key=${CONFIG.YOUTUBE_API_KEY}`;
            const channelRes = await fetch(channelUrl);
            const channelData = await channelRes.json();
            if (!channelData.items?.length) throw new Error('القناة غير موجودة');
            const uploadsId = channelData.items[0].contentDetails.relatedPlaylists.uploads;

            const playlistUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=3&playlistId=${uploadsId}&key=${CONFIG.YOUTUBE_API_KEY}`;
            const playlistRes = await fetch(playlistUrl);
            const playlistData = await playlistRes.json();
            if (!playlistData.items?.length) throw new Error('لا توجد فيديوهات');

            track.innerHTML = '';
            playlistData.items.forEach(item => {
                const video = item.snippet;
                const videoId = video.resourceId.videoId;
                const thumb = video.thumbnails.medium?.url || 'https://via.placeholder.com/320x180?text=لا+توجد+صورة';
                const card = document.createElement('div');
                card.className = 'card-single';
                card.setAttribute('data-href', `https://www.youtube.com/watch?v=${videoId}`);
                card.addEventListener('click', () => window.open(card.dataset.href, '_blank'));

                card.innerHTML = `
                    <img src="${thumb}" alt="${video.title}" loading="lazy" onerror="this.src='https://via.placeholder.com/320x180?text=خطأ+في+الصورة'">
                    <h3>${video.title.length > 60 ? video.title.substring(0, 60) + '…' : video.title}</h3>
                `;
                track.appendChild(card);
            });
        } catch (error) {
            track.innerHTML = `<div class="error-message">❌ ${getErrorMessage(error)}</div>`;
        }
    }

    function initSingleSlider(trackId, prevId, nextId, pauseId) {
        const track = document.getElementById(trackId);
        const prevBtn = document.getElementById(prevId);
        const nextBtn = document.getElementById(nextId);
        const pauseBtn = document.getElementById(pauseId);
        if (!track || !prevBtn || !nextBtn || !pauseBtn) return;

        const cards = track.children;
        if (cards.length === 0) return;

        let currentIndex = 0;
        let interval;
        let paused = false;

        function updatePosition() {
            const container = track.parentElement;
            const containerWidth = container.offsetWidth;
            track.style.transform = `translateX(-${currentIndex * containerWidth}px)`;
        }

        function next() {
            currentIndex = (currentIndex + 1) % cards.length;
            updatePosition();
        }

        function prev() {
            currentIndex = (currentIndex - 1 + cards.length) % cards.length;
            updatePosition();
        }

        function startAutoPlay() {
            if (interval) clearInterval(interval);
            interval = setInterval(() => {
                if (!paused) next();
            }, CONFIG.SLIDER_INTERVAL);
        }

        prevBtn.addEventListener('click', () => { prev(); startAutoPlay(); });
        nextBtn.addEventListener('click', () => { next(); startAutoPlay(); });

        pauseBtn.addEventListener('click', () => {
            paused = !paused;
            pauseBtn.innerHTML = paused ? '<i class="fas fa-play"></i> تشغيل' : '<i class="fas fa-pause"></i> إيقاف';
        });

        window.addEventListener('resize', updatePosition);
        setTimeout(updatePosition, 100);
        startAutoPlay();
    }

    window.initIndexPage = function() {
        // تشغيل سلايدر الفيديو بعد تحميل الفيديوهات
        Promise.all([fetchYouTubeVideos()]).then(() => {
            initSingleSlider('videoTrack', 'prevVideo', 'nextVideo', 'pauseVideoBtn');
        });

        // جلب الكتب من Drive (بما في ذلك المجلدات الفرعية) ثم تشغيل السلايدر الخاص بها
        fetchBooksFromDrive().then(() => {
            initSingleSlider('booksTrack', 'prevBook', 'nextBook', 'pauseBooksBtn');
        });
    };
})();