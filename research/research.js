/**
 * research.js – صفحة الأبحاث العلمية
 */
(function() {
    const researchData = [
        { id: 1, category: "تحقيق تراث", title: "منهج الإمام الهادي إلى الحق في استنباط الأحكام", author: "أ.د. يحيى بن محمد المتوكل", abstract: "دراسة تحليلية مقارنة تتناول القواعد الأصولية التي اعتمد عليها الإمام الهادي في تأسيس مدرسته الفقهية..", date: "رجب 1447هـ", file: "#", tags: ["أصول الفقه", "الهادي"] },
        { id: 2, category: "دراسات معاصرة", title: "الفكر الزيدي ومواجهة التحديات الحديثة", author: "إبراهيم بن علي الوزير", abstract: "بحث يتطرق إلى مرونة الفكر الزيدي وقدرته على استيعاب المستجدات العصرية مع الحفاظ على الأصول الثابتة.", date: "شوال 1446هـ", file: "#", tags: ["الفكر", "تجديد"] },
        { id: 3, category: "تحقيق تراث", title: "تحقيق كتاب 'الأمالي' لأبي طالب", author: "د. أحمد الزيدي", abstract: "تحقيق علمي لكتاب الأمالي مع مقدمة في منهج التحقيق.", date: "جمادى الأولى 1448هـ", file: "#", tags: ["تحقيق", "أمالي"] }
    ];

    let currentFilter = 'كل الأبحاث';
    const filterBar = document.querySelector('.filter-bar');
    const researchList = document.getElementById('researchList');

    if (!filterBar || !researchList) return;

    const categories = ['كل الأبحاث', ...new Set(researchData.map(r => r.category))];

    function renderFilters() {
        filterBar.innerHTML = categories.map(cat => `
            <div class="filter-chip ${cat === currentFilter ? 'active' : ''}" data-category="${cat}">${cat}</div>
        `).join('');
    }

    function filterResearch(category) {
        currentFilter = category;
        const filtered = category === 'كل الأبحاث' ? researchData : researchData.filter(r => r.category === category);
        renderResearch(filtered);
    }

    function renderResearch(data) {
        if (data.length === 0) {
            researchList.innerHTML = '<div class="empty-state">لا توجد أبحاث</div>';
            return;
        }
        researchList.innerHTML = data.map(r => `
            <div class="research-card">
                <div class="res-category">${r.category}</div>
                <div class="res-title">${r.title}</div>
                <div class="res-author">👤 إعداد: ${r.author}</div>
                <p class="res-abstract">${r.abstract}</p>
                <div class="res-footer">
                    <a href="${r.file}" class="btn-download">💾 تحميل البحث (PDF)</a>
                    <span class="res-date">نشر في: ${r.date}</span>
                </div>
            </div>
        `).join('');
    }

    window.initResearchPage = function() {
        renderFilters();

        filterBar.addEventListener('click', (e) => {
            const chip = e.target.closest('.filter-chip');
            if (!chip) return;
            document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            filterResearch(chip.dataset.category);
        });

        filterResearch('كل الأبحاث');
    };
})();