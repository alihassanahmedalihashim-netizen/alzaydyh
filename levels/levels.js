/**
 * levels.js – صفحة المستويات العلمية
 */
(function() {
    window.toggleLevel = function(header) {
        header.closest('.level-card').classList.toggle('active');
    };

    const filterButtons = document.querySelectorAll('.filter-btn');
    if (filterButtons.length) {
        filterButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                filterButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const filter = btn.dataset.filter;
                document.querySelectorAll('.level-card').forEach(card => {
                    card.style.display = (filter === 'all' || card.dataset.category === filter) ? 'block' : 'none';
                });
            });
        });
    }

    window.initLevelsPage = function() {
        // أي تهيئة إضافية إن وجدت
    };
})();