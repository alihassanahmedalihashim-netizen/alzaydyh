/**
 * about.js – صفحة "عن المنصة"
 */
(function() {
    window.initAboutPage = function() {
        const cards = document.querySelectorAll('.card, .team-member');
        cards.forEach((el, i) => {
            el.style.opacity = '0';
            el.style.transform = 'translateY(15px)';
            setTimeout(() => {
                el.style.transition = 'all 0.5s ease';
                el.style.opacity = '1';
                el.style.transform = 'translateY(0)';
            }, i * 70);
        });
    };
})();