/**
 * fatwa.js – صفحة الفتاوى النصية
 */
(function() {
    // بيانات الفتاوى التجريبية (يمكن استبدالها بجلب من API)
    const sampleFatwas = [
        { id: 1, question: "ما حكم صلاة الجمعة في ظل الظروف الحالية؟", answer: "صلاة الجمعة واجبة على الرجال الأحرار البالغين المقيمين الذين يسمعون النداء...", mufti: "الشيخ أحمد الحسني", date: "15 أكتوبر 2023", tags: ["الصلاة", "الجمعة", "العبادات"], views: 1245 },
        { id: 2, question: "كيفية توزيع زكاة الفطر، وما مقدارها؟", answer: "زكاة الفطر فرض على كل مسلم قادر، مقدارها صاع من طعام...", mufti: "لجنة الفتوى المركزية", date: "1 سبتمبر 2023", tags: ["الزكاة", "الفطر", "المعاملات"], views: 892 },
        // أضف بقية الفتاوى حسب الحاجة (كانت 8 في الكود الأصلي)
    ];

    let filteredFatwas = [...sampleFatwas];
    let searchTerm = '';
    let activeCategory = 'الكل';

    const categoriesContainer = document.getElementById('categoriesContainer');
    const fatwaGrid = document.getElementById('fatwaGrid');
    const searchInput = document.getElementById('searchInput');

    if (!categoriesContainer || !fatwaGrid) return;

    const allTags = ['الكل', ...new Set(sampleFatwas.flatMap(f => f.tags))];

    function renderCategories() {
        categoriesContainer.innerHTML = allTags.map(cat => `
            <button class="category-btn ${cat === activeCategory ? 'active' : ''}" data-category="${cat}">${cat}</button>
        `).join('');
    }

    function applyFilters() {
        filteredFatwas = sampleFatwas.filter(fatwa => {
            const matchesSearch = searchTerm === '' || 
                fatwa.question.includes(searchTerm) || 
                fatwa.answer.includes(searchTerm) ||
                fatwa.mufti.includes(searchTerm) ||
                fatwa.tags.some(t => t.includes(searchTerm));
            const matchesCategory = activeCategory === 'الكل' || fatwa.tags.includes(activeCategory);
            return matchesSearch && matchesCategory;
        });
        renderFatwas();
    }

    function renderFatwas() {
        if (filteredFatwas.length === 0) {
            fatwaGrid.innerHTML = `<div class="empty-state"><i class="fas fa-search"></i><h3>لا توجد نتائج</h3><p>حاول بكلمات أخرى</p></div>`;
            return;
        }
        fatwaGrid.innerHTML = filteredFatwas.map(f => `
            <div class="fatwa-card">
                <div class="fatwa-header"><h3 class="fatwa-question">${f.question}</h3></div>
                <div class="fatwa-body">
                    <div class="fatwa-answer">${f.answer}</div>
                    <div class="fatwa-tags">${f.tags.map(t => `<span class="tag">${t}</span>`).join('')}</div>
                    <div class="fatwa-meta">
                        <span><i class="fas fa-user"></i> ${f.mufti}</span>
                        <span><i class="fas fa-calendar"></i> ${f.date}</span>
                    </div>
                </div>
            </div>
        `).join('');
    }

    function setupEvents() {
        if (searchInput) {
            searchInput.addEventListener('input', debounce((e) => {
                searchTerm = e.target.value.trim();
                applyFilters();
            }, CONFIG.DEBOUNCE_DELAY));
        }

        categoriesContainer.addEventListener('click', (e) => {
            const btn = e.target.closest('.category-btn');
            if (!btn) return;
            document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeCategory = btn.dataset.category;
            applyFilters();
        });
    }

    window.initFatwaPage = function() {
        renderCategories();
        renderFatwas();
        setupEvents();
    };
})();