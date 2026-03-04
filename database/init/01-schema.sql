-- 터잡이 서비스 기초 데이터베이스 스키마

-- 예시: 사용자(Users) 테이블
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 초기 테스트 데이터 삽입 (선택 사항)
-- INSERT INTO users (email, password_hash, name) VALUES ('test@example.com', 'hashed_pw', '테스터');
