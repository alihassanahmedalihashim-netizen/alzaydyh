/**
 * library.js – صفحة المكتبة المتطورة (معتمدة على main.js)
 */
(function() {
    if (!document.getElementById('booksGrid')) return;

    // ==================== إعدادات ====================
    const API_KEY = CONFIG.GOOGLE_DRIVE_API_KEY;
    const LIBRARY_FOLDER_ID = CONFIG.LIBRARY_FOLDER_ID;
    const CACHE_KEY = 'library_books_v8';
    const CACHE_EXPIRY = 60 * 60 * 1000; // ساعة
    const BOOKS_PER_PAGE = 7;

    // ==================== الحالة ====================
    const state = {
        allBooks: [],
        authorsList: [],
        categories: [],
        filteredBooks: [],
        currentView: 'books',
        currentCategory: 'all',
        currentAuthor: null,
        currentPage: 1,
        favorites: JSON.parse(localStorage.getItem('lib_favs') || '[]'),
        readingList: JSON.parse(localStorage.getItem('reading_list') || '[]'),
        recentBooks: JSON.parse(localStorage.getItem('recent_books') || '[]'),
        downloadStats: JSON.parse(localStorage.getItem('download_stats') || '{}'),
        viewStats: JSON.parse(localStorage.getItem('view_stats') || '{}'),
        readingProgress: JSON.parse(localStorage.getItem('reading_progress') || '{}')
    };

    // ==================== عناصر DOM ====================
    const DOM = {
        grid: document.getElementById('booksGrid'),
        searchInput: document.getElementById('searchInput'),
        categoryContainer: document.getElementById('categoryContainer'),
        booksCount: document.getElementById('booksCount'),
        progressBar: document.getElementById('progressBar'),
        noResults: document.getElementById('noResults'),
        refreshBtn: document.getElementById('refreshBtn'),
        loadMoreBtn: document.getElementById('loadMoreBtn'),
        loadMoreContainer: document.getElementById('loadMoreContainer'),
        modal: document.getElementById('previewModal'),
        modalTitle: document.getElementById('modalBookTitle'),
        iframeContainer: document.getElementById('iframeContainer'),
        readingProgressFill: document.getElementById('readingProgress'),
        viewToggleButtons: document.querySelectorAll('.view-toggle-btn')
    };

    // ==================== دوال مساعدة (تعتمد على main.js) ====================
    const Utils = {
        parseFilename: (filename) => {
            const base = filename.replace(/\.pdf$/i, '');
            const parts = base.split('-').map(s => s.trim());
            return {
                title: parts[0] || base,
                author: parts[1] || 'مؤلف غير معروف',
                imageNumber: parts[2] || null
            };
        },
        formatSize: (bytes) => formatSize(bytes), // من main.js
        updateProgress: (percent) => {
            if (DOM.progressBar) DOM.progressBar.style.width = `${percent}%`;
        },
        debounce: (fn, delay) => debounce(fn, delay) // من main.js
    };

    // ==================== خدمات Google Drive ====================
    const DriveAPI = {
        fetchWithRetry: async (url, retries = 3) => {
            for (let i = 0; i < retries; i++) {
                try {
                    const res = await fetchWithTimeout(url);
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    return await res.json();
                } catch (e) {
                    if (i === retries - 1) throw e;
                }
            }
        },
        getSubfolderId: async (parentId, folderName) => {
            const query = `'${parentId}' in parents and name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
            const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&key=${API_KEY}&fields=files(id)`;
            const data = await DriveAPI.fetchWithRetry(url);
            return data.files?.[0]?.id || null;
        },
        getAllSubfolders: async (parentId) => {
            let subfolders = [];
            let pageToken = null;
            do {
                const query = `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
                let url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&key=${API_KEY}&fields=nextPageToken,files(id,name)&pageSize=100`;
                if (pageToken) url += `&pageToken=${pageToken}`;
                const data = await DriveAPI.fetchWithRetry(url);
                if (data.files) subfolders.push(...data.files);
                pageToken = data.nextPageToken;
            } while (pageToken);
            return subfolders;
        },
        getAllFilesInFolder: async (folderId) => {
            let files = [];
            let pageToken = null;
            do {
                const query = `'${folderId}' in parents and mimeType contains 'application/pdf' and trashed = false`;
                let url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&key=${API_KEY}&fields=nextPageToken,files(id,name,size,modifiedTime)&pageSize=100`;
                if (pageToken) url += `&pageToken=${pageToken}`;
                const data = await DriveAPI.fetchWithRetry(url);
                if (data.files) files.push(...data.files);
                pageToken = data.nextPageToken;
            } while (pageToken);
            return files;
        }
    };

    // ==================== تحميل الكتب ====================
    async function fetchAllBooks() {
        showLoading(DOM.grid, 'جاري تحميل المكتبة...');
        Utils.updateProgress(10);

        const cached = getWithExpiry(CACHE_KEY);
        if (cached) {
            Object.assign(state, cached);
            state.filteredBooks = [...state.allBooks];
            Utils.updateProgress(100);
            renderView();
            renderCategoryTabs();
            setTimeout(() => Utils.updateProgress(0), 500);
            return;
        }

        try {
            Utils.updateProgress(20);
            const booksParentId = await DriveAPI.getSubfolderId(LIBRARY_FOLDER_ID, 'books');
            if (!booksParentId) throw new Error('مجلد "books" غير موجود');

            const categoryFolders = await DriveAPI.getAllSubfolders(booksParentId);
            state.categories = categoryFolders.map(f => f.name);

            Utils.updateProgress(40);
            const fetchPromises = categoryFolders.map(folder =>
                DriveAPI.getAllFilesInFolder(folder.id).then(files => files.map(f => ({ ...f, category: folder.name })))
            );
            const results = await Promise.all(fetchPromises);
            const allFiles = results.flat();

            Utils.updateProgress(70);
            state.allBooks = allFiles.map(file => {
                const parsed = Utils.parseFilename(file.name);
                return {
                    id: file.id,
                    title: parsed.title,
                    author: parsed.author,
                    category: file.category,
                    imageNumber: parsed.imageNumber,
                    imageUrl: `https://drive.google.com/thumbnail?id=${file.id}&sz=w400`,
                    size: file.size,
                    modifiedTime: file.modifiedTime,
                    downloadUrl: `https://drive.google.com/uc?export=download&id=${file.id}`,
                    previewUrl: `https://drive.google.com/file/d/${file.id}/preview`
                };
            });

            Utils.updateProgress(90);
            const authorMap = new Map();
            state.allBooks.forEach(book => {
                const author = book.author;
                if (!authorMap.has(author)) {
                    authorMap.set(author, { name: author, count: 0, books: [] });
                }
                authorMap.get(author).count++;
                authorMap.get(author).books.push(book);
            });
            state.authorsList = Array.from(authorMap.values()).sort((a, b) => a.name.localeCompare(b.name, 'ar'));

            setWithExpiry(CACHE_KEY, {
                allBooks: state.allBooks,
                authorsList: state.authorsList,
                categories: state.categories
            }, CACHE_EXPIRY);

            Utils.updateProgress(100);
            state.filteredBooks = [...state.allBooks];
            renderView();
            renderCategoryTabs();
            setTimeout(() => Utils.updateProgress(0), 500);

        } catch (error) {
            showError(DOM.grid, 'حدث خطأ في تحميل المكتبة: ' + error.message);
            console.error(error);
        }
    }

    // ==================== العرض ====================
    function renderBooks() {
        let filtered = state.filteredBooks;
        if (state.currentCategory !== 'all') {
            filtered = filtered.filter(book => book.category === state.currentCategory);
        }
        if (state.currentAuthor) {
            filtered = filtered.filter(book => book.author === state.currentAuthor);
        }

        const endIndex = state.currentPage * BOOKS_PER_PAGE;
        const booksToShow = filtered.slice(0, endIndex);

        if (booksToShow.length === 0) {
            DOM.noResults?.classList.remove('d-none');
            DOM.grid.innerHTML = '';
            if (DOM.booksCount) DOM.booksCount.textContent = 'لا توجد كتب';
            if (DOM.loadMoreContainer) DOM.loadMoreContainer.style.display = 'none';
            return;
        }

        DOM.noResults?.classList.add('d-none');
        if (DOM.booksCount) DOM.booksCount.textContent = `📚 عرض ${booksToShow.length} من ${filtered.length} كتاب`;

        DOM.grid.innerHTML = booksToShow.map((book, index) => {
            const isFav = state.favorites.includes(book.id);
            const isReading = state.readingList.includes(book.id);

            return `
                <div class="col" style="animation-delay: ${index * 0.02}s">
                    <div class="book-card">
                        <div class="cover-container">
                            <img src="${book.imageUrl}" loading="lazy" alt="${book.title}" onerror="this.onerror=null; this.src='images/books/default-book.jpg';">
                            <div class="book-overlay-btns">
                                <button class="mini-btn" data-action="toggleFav" data-id="${book.id}" title="المفضلة">
                                    <i class="${isFav ? 'fas text-danger' : 'far'} fa-heart"></i>
                                </button>
                                <button class="mini-btn" data-action="toggleReading" data-id="${book.id}" title="قائمة القراءة">
                                    <i class="${isReading ? 'fas text-warning' : 'far'} fa-bookmark"></i>
                                </button>
                                <button class="mini-btn" data-action="shareBook" data-id="${book.id}" data-title="${book.title}" title="مشاركة">
                                    <i class="fas fa-share-alt"></i>
                                </button>
                                <button class="mini-btn" data-action="openPreview" data-id="${book.id}" data-title="${book.title}" title="معاينة">
                                    <i class="fas fa-eye"></i>
                                </button>
                            </div>
                        </div>
                        <div class="book-info">
                            <span class="author-tag">${book.author}</span>
                            <h6 class="book-title" title="${book.title}">${book.title}</h6>
                            <div class="d-flex justify-content-between align-items-center mt-3 small text-muted">
                                <span><i class="fas fa-file-pdf text-danger me-1"></i>${Utils.formatSize(book.size)}</span>
                                <span><i class="fas fa-download me-1"></i>${state.downloadStats[book.id] || 0}</span>
                            </div>
                            <hr class="opacity-10">
                            <div class="d-flex gap-2 mt-2">
                                <a href="${book.downloadUrl}" target="_blank" class="btn btn-primary btn-sm flex-grow-1" data-action="incrementDownload" data-id="${book.id}">
                                    <i class="fas fa-download"></i> تحميل
                                </a>
                                <button class="btn btn-outline btn-sm flex-grow-1" data-action="openPreview" data-id="${book.id}" data-title="${book.title}">
                                    <i class="fas fa-eye"></i> عرض
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        if (DOM.loadMoreContainer) {
            DOM.loadMoreContainer.style.display = filtered.length > endIndex ? 'block' : 'none';
        }
    }

    function renderAuthors() {
        let filteredAuthors = state.authorsList;
        const term = DOM.searchInput?.value.toLowerCase().trim();
        if (term) {
            filteredAuthors = filteredAuthors.filter(a => a.name.toLowerCase().includes(term));
        }

        if (filteredAuthors.length === 0) {
            DOM.noResults?.classList.remove('d-none');
            DOM.grid.innerHTML = '';
            if (DOM.booksCount) DOM.booksCount.textContent = 'لا يوجد مؤلفين';
            if (DOM.loadMoreContainer) DOM.loadMoreContainer.style.display = 'none';
            return;
        }

        DOM.noResults?.classList.add('d-none');
        if (DOM.booksCount) DOM.booksCount.textContent = `👤 عرض ${filteredAuthors.length} مؤلف`;

        DOM.grid.innerHTML = filteredAuthors.map((author, index) => `
            <div class="col" style="animation-delay: ${index * 0.02}s">
                <div class="author-card" data-action="showAuthorBooks" data-author="${author.name}">
                    <div class="author-avatar">
                        <i class="fas fa-user-graduate fa-3x"></i>
                    </div>
                    <h4 class="author-name">${author.name}</h4>
                    <p class="author-count">عدد الكتب: ${author.count}</p>
                    <button class="btn btn-outline btn-sm mt-2">عرض الكتب</button>
                </div>
            </div>
        `).join('');

        if (DOM.loadMoreContainer) DOM.loadMoreContainer.style.display = 'none';
    }

    function renderView() {
        if (state.currentView === 'books') renderBooks();
        else renderAuthors();
    }

    function renderCategoryTabs() {
        if (!DOM.categoryContainer) return;
        let html = `<button class="category-tab ${state.currentCategory === 'all' ? 'active' : ''}" data-category="all">الكل</button>`;
        state.categories.forEach(cat => {
            html += `<button class="category-tab ${state.currentCategory === cat ? 'active' : ''}" data-category="${cat}">${cat}</button>`;
        });
        DOM.categoryContainer.innerHTML = html;
    }

    // ==================== إدارة الأحداث ====================
    function setupEventDelegation() {
        DOM.grid.addEventListener('click', (e) => {
            const target = e.target.closest('[data-action]');
            if (!target) return;

            const action = target.dataset.action;
            const id = target.dataset.id;
            const title = target.dataset.title;

            switch (action) {
                case 'toggleFav':
                    if (state.favorites.includes(id)) {
                        state.favorites = state.favorites.filter(f => f !== id);
                        showToast('تمت الإزالة من المفضلة', 'info');
                    } else {
                        state.favorites.push(id);
                        showToast('تمت الإضافة إلى المفضلة', 'success');
                    }
                    localStorage.setItem('lib_favs', JSON.stringify(state.favorites));
                    renderBooks();
                    break;

                case 'toggleReading':
                    if (state.readingList.includes(id)) {
                        state.readingList = state.readingList.filter(r => r !== id);
                        showToast('تمت الإزالة من قائمة القراءة', 'info');
                    } else {
                        state.readingList.push(id);
                        showToast('تمت الإضافة إلى قائمة القراءة', 'success');
                    }
                    localStorage.setItem('reading_list', JSON.stringify(state.readingList));
                    renderBooks();
                    break;

                case 'shareBook':
                    const url = `https://drive.google.com/file/d/${id}/view`;
                    if (navigator.share) {
                        navigator.share({ title, url }).catch(console.error);
                    } else {
                        copyToClipboard(url);
                    }
                    break;

                case 'openPreview':
                    if (!DOM.modal || !DOM.modalTitle || !DOM.iframeContainer) return;
                    DOM.modalTitle.innerText = title;
                    DOM.iframeContainer.innerHTML = `<iframe src="https://drive.google.com/file/d/${id}/preview" style="width:100%; height:80vh; border:none;" allow="autoplay"></iframe>`;
                    new bootstrap.Modal(DOM.modal).show();
                    addToRecent(id);
                    incrementView(id);
                    if (DOM.readingProgressFill) {
                        DOM.readingProgressFill.style.width = (state.readingProgress[id] || 0) + '%';
                    }
                    break;

                case 'incrementDownload':
                    state.downloadStats[id] = (state.downloadStats[id] || 0) + 1;
                    localStorage.setItem('download_stats', JSON.stringify(state.downloadStats));
                    break;

                case 'showAuthorBooks':
                    state.currentView = 'books';
                    state.currentAuthor = target.dataset.author;
                    state.filteredBooks = state.allBooks.filter(book => book.author === state.currentAuthor);
                    state.currentPage = 1;
                    DOM.viewToggleButtons.forEach(btn => btn.classList.remove('active'));
                    document.querySelector('[data-view="books"]')?.classList.add('active');
                    renderBooks();
                    break;
            }
        });
    }

    function addToRecent(id) {
        const book = state.allBooks.find(b => b.id === id);
        if (!book) return;
        state.recentBooks = [book, ...state.recentBooks.filter(b => b.id !== id)].slice(0, 6);
        localStorage.setItem('recent_books', JSON.stringify(state.recentBooks));
    }

    function incrementView(id) {
        state.viewStats[id] = (state.viewStats[id] || 0) + 1;
        localStorage.setItem('view_stats', JSON.stringify(state.viewStats));
    }

    // ==================== التهيئة ====================
    window.initEliteLibraryPage = function() {
        fetchAllBooks();

        // أحداث التصنيفات
        DOM.categoryContainer?.addEventListener('click', (e) => {
            if (!e.target.classList.contains('category-tab')) return;
            DOM.categoryContainer.querySelectorAll('.category-tab').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            state.currentCategory = e.target.dataset.category;
            state.currentPage = 1;
            if (state.currentView === 'books') {
                state.filteredBooks = state.allBooks.filter(book => state.currentCategory === 'all' || book.category === state.currentCategory);
                renderBooks();
            } else {
                renderAuthors();
            }
        });

        // البحث مع debounce
        const handleSearch = Utils.debounce(() => {
            const term = DOM.searchInput?.value.toLowerCase().trim() || '';
            if (state.currentView === 'books') {
                state.filteredBooks = state.allBooks.filter(book =>
                    book.title.toLowerCase().includes(term) ||
                    book.author.toLowerCase().includes(term)
                );
                state.currentPage = 1;
                renderBooks();
            } else {
                renderAuthors();
            }
        }, CONFIG.DEBOUNCE_DELAY);

        DOM.searchInput?.addEventListener('input', handleSearch);

        // أزرار تبديل العرض
        DOM.viewToggleButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                DOM.viewToggleButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                state.currentView = btn.dataset.view;
                state.currentPage = 1;
                state.currentAuthor = null;
                if (state.currentView === 'books') {
                    state.filteredBooks = state.allBooks.filter(book => state.currentCategory === 'all' || book.category === state.currentCategory);
                    renderBooks();
                } else {
                    renderAuthors();
                }
            });
        });

        DOM.refreshBtn?.addEventListener('click', () => {
            localStorage.removeItem(CACHE_KEY);
            fetchAllBooks();
        });

        DOM.loadMoreBtn?.addEventListener('click', () => {
            state.currentPage++;
            renderBooks();
        });

        setupEventDelegation();
    };
})();