// frontend/js/config.js
// ⚠️  이 파일은 .gitignore에 의해 Git 추적에서 제외됩니다.
// ⚠️  실제 키 값을 여기에 작성하고, GitHub에 절대 커밋하지 마세요.
// 참고 양식: config.example.js

const CONFIG = {
    API_BASE_URL: window.location.hostname === 'localhost' ? 'http://localhost:3001' : 'https://api.teojabi.com',
    NAVER_MAP_CLIENT_ID: 'f8td9fq8kq',
};
