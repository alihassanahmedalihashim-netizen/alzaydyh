/**
 * video-library.js – صفحة مكتبة الفيديو (قوائم تشغيل يوتيوب)
 */
(function() {
    const grid = document.getElementById('playlists-grid');
    const channelLink = document.getElementById('channel-link');

    if (!grid) return;

    if (channelLink) {
        channelLink.href = `https://www.youtube.com/channel/${CONFIG.YOUTUBE_CHANNEL_ID}`;
    }

    async function fetchPlaylists() {
        showLoading(grid, 'جاري تحميل قوائم التشغيل...');
        try {
            const url = `https://www.googleapis.com/youtube/v3/playlists?part=snippet,contentDetails&channelId=${CONFIG.YOUTUBE_CHANNEL_ID}&maxResults=50&key=${CONFIG.YOUTUBE_API_KEY}`;
            const response = await fetchWithTimeout(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            if (data.error) throw new Error(data.error.message);
            if (!data.items?.length) {
                grid.innerHTML = '<div class="empty-state">لا توجد قوائم تشغيل متاحة</div>';
                return;
            }

            grid.innerHTML = data.items.map(playlist => {
                const { id, snippet, contentDetails } = playlist;
                const thumb = snippet.thumbnails.high?.url || snippet.thumbnails.default?.url;
                return `
                    <div class="playlist-card">
                        <div class="thumbnail-container">
                            <img src="${thumb}" alt="${snippet.title}" loading="lazy">
                            <span class="video-count"><i class="fas fa-video"></i> ${contentDetails.itemCount} فيديو</span>
                        </div>
                        <h3>📌 ${snippet.title}</h3>
                        <div class="card-footer">
                            <a href="https://www.youtube.com/playlist?list=${id}" class="btn-playlist" target="_blank" rel="noopener">
                                <i class="fas fa-external-link-alt"></i> فتح القائمة
                            </a>
                        </div>
                    </div>
                `;
            }).join('');
        } catch (error) {
            showError(grid, getErrorMessage(error));
        }
    }

    window.initVideoLibraryPage = function() {
        fetchPlaylists();
    };
})();