# 터잡이 서비스 (Teojabi Service) 요구사항 및 정보 기록

이 문서는 멘토와 멘티 간의 대화를 바탕으로 프로젝트에 필요한 요소, 확인된 정보, 체크해야 할 기록 등을 지속적으로 업데이트하기 위한 용도로 작성되었습니다.

## 논의 중/확인된 항목

- [x] **API 연동을 위한 키 관리 방안**:
  - **공통 원칙**: 모든 시크릿, API 키 식별자, DB 접속 정보 등은 GitHub 원격 저장소 코드 내에 평문으로 커밋을 엄격히 금지함.
  - **프론트엔드 (Pure HTML/JS)**:
    - 클라이언트 노출 키(카카오 지도 SDK 키 등): 별도의 환경변수 파일 관리 대신 CI/CD나 빌드 주입/스크립트 내 하드코딩(보안 주의) 혹은 별도의 config.js 파일로 관리
    - 소셜 로그인 처리가 백엔드로 이관됨에 따라 프론트엔드는 단순 JWT 송수신 상태만 확인. **실제 토큰 관리는 HttpOnly, Secure, SameSite 속성이 적용된 보안 쿠키**를 백엔드에서 전담 발급하여 브라우저가 자동 관리하도록 위임
  - **백엔드 (NestJS)**:
    - 데이터베이스(Supabase) 접속 URI, 공공데이터 포털 API 인코딩/디코딩 키는 루트 `.env`를 통해 관리하고 `@nestjs/config` 패키지의 `ConfigService`로 타입 안정성을 부여하여 동적 주입
    - **CORS 설정**: 프론트엔드(Porkbun)와 백엔드(NCP) 도메인이 분리되어 있으므로, `main.ts`에 프론트엔드 도메인 화이트리스트 및 `credentials: true` 설정을 필수로 반영
  - **배포 환경 (CI/CD)**:
    - GitHub Actions: 프론트엔드 정적 호스팅(Porkbun) 배포용 FTP 시크릿(`FTP_SERVER`, `FTP_USERNAME`, `FTP_PASSWORD`)과 백엔드(NCP) 배포용 SSH 접속 정보는 **GitHub Repository Secrets**에 등록하여 Workflow에서만 접근 가능하도록 설정
    - 배포 서버: 네이버 클라우드 플랫폼(NCP) 등 호스팅 환경에 맞게 Product용 키를 `.env` 형식으로 주입
- [x] **주요 핵심 기능 정의**:
  1. 지번 주소를 키로 하는 부동산 컨설팅 매물 이미지 갤러리형 게시판
  2. 네이버 지도 서비스 기반 부동산 검색 및 매물 마커 표시
  3. 사용자 인터랙션 (상담 예약, 마이페이지/관심 매물 관리)
  4. 공공 API 연동: 실거래가, 공시지가 (공공데이터 포털) 및 토지이음 API (실시간 Proxy가 아닌 **서비스 DB에 주기적으로 적재 및 갱신(Caching)** 구조 적용하여 속도 보장)
  5. 인증 (Authentication): NestJS 백엔드(Passport.js)에서 네이버, 카카오, 구글 소셜 로그인을 전담하여 프론트엔드로 **HttpOnly 보안 쿠키** 발급
  6. 권한: 사용자별 권한 등급 및 콘텐츠 접근 제어
- [x] **데이터베이스 활용 고려사항**:
  - Supabase PostgreSQL에서 PostGIS 확장을 활용하여 지리/공간 정보(지도 마커) 쿼리 최적화

## 추가적인 체크 리스트

- [x] 3-Tier 기반 아키텍처 및 폴더 구조 세팅
- [x] 기술 스택 논의 및 결정 완료
  - **프론트엔드 (Frontend)**: HTML, CSS, Vanilla JS
  - **백엔드 (Backend)**: NestJS
  - **데이터베이스 (Database)**: PostgreSQL (Supabase)
- [x] 인프라 호스팅 및 CI/CD 파이프라인 논의 완료
  - **프론트엔드 호스팅**: Porkbun (정적 호스팅 및 FTP 배포)
  - **백엔드 호스팅**: 네이버 클라우드 플랫폼 (NCP) 서버
  - **데이터베이스 호스팅**: Supabase (PostgreSQL + PostGIS)
  - **CI/CD 플랫폼**: GitHub Actions (코드 푸시 시 Porkbun FTP 업로드 및 NCP 서버 SSH 갱신/빌드)
