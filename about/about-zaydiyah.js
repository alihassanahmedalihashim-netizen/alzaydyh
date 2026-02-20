/**
 * about-zaydiyah.js – صفحة نبذة عن العقيدة الزيدية
 */
(function() {
    window.initAboutZaydiyahPage = function() {
        const cards = document.querySelectorAll('.article-card, .article-mini-card');
        cards.forEach((card, i) => {
            card.style.opacity = '0';
            card.style.transform = 'translateY(15px)';
            setTimeout(() => {
                card.style.transition = 'all 0.5s ease';
                card.style.opacity = '1';
                card.style.transform = 'translateY(0)';
            }, i * 70);
        });
    };
})();