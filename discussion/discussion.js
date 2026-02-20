/**
 * discussion.js – صفحة الحوار والمناقشة
 */
(function() {
    const chatArea = document.getElementById('chatArea');
    const userInput = document.getElementById('userInput');
    const sendBtn = document.querySelector('.send-btn');

    if (!chatArea || !userInput) return;

    function sendMessage() {
        const text = userInput.value.trim();
        if (!text) return;
        const now = new Date();
        const time = now.getHours() + ':' + now.getMinutes().toString().padStart(2, '0');
        chatArea.innerHTML += `
            <div class="message-box user">
                <span class="sender-name">أنا</span>
                <div class="message-text">${text}</div>
                <span class="time">${time}</span>
            </div>
        `;
        userInput.value = '';
        chatArea.scrollTop = chatArea.scrollHeight;
    }

    window.initDiscussionPage = function() {
        sendBtn?.addEventListener('click', sendMessage);
        userInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendMessage();
        });
    };
})();