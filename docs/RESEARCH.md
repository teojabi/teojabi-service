# 터잡이 서비스 (Teojabi Service) 요구사항 및 정보 기록

이 문서는 멘토와 멘티 간의 대화를 바탕으로 프로젝트에 필요한 요소, 확인된 정보, 체크해야 할 기록 등을 지속적으로 업데이트하기 위한 용도로 작성되었습니다.

## 논의 중/확인된 항목

- [x] **API 연동을 위한 키 관리 방안**:
  - **공통 원칙**: 모든 시크릿, API 키 식별자, DB 접속 정보 등은 GitHub 원격 저장소 코드 내에 평문으로 커밋을 엄격히 금지함.
  - **프론트엔드 (Next.js)**:
    - 클라이언트 노출 키(카카오 지도 SDK 키 등): `.env.local`에서 `NEXT_PUBLIC_` 접두사를 붙여 사용
    - 소셜 로그인 처리가 백엔드로 이관됨에 따라 프론트엔드는 단순 JWT 보관 기능만 담당
  - **백엔드 (NestJS)**:
    - 데이터베이스(Supabase) 접속 URI, 공공데이터 포털 API 인코딩/디코딩 키는 루트 `.env`를 통해 관리하고 `@nestjs/config` 패키지의 `ConfigService`로 타입 안정성을 부여하여 동적 주입
  - **배포 환경 (CI/CD)**:
    - GitHub Actions: 프론트엔드 FTP 배포용 시크릿(`FTP_SERVER`, `FTP_USERNAME`, `FTP_PASSWORD`)과 백엔드 토큰(`RAILWAY_TOKEN`)은 **GitHub Repository Secrets**에 등록하여 Workflow에서만 접근 가능하도록 설정
    - 배포 서버: Vercel(추후 확정 시), Railway, Porkbun 등 각 호스팅 대시보드의 환경 변수(Environment Variables) 설정 메뉴에 Product용 키를 개별 등록
- [x] **주요 핵심 기능 정의**:
  1. 지번 주소를 키로 하는 부동산 컨설팅 매물 이미지 갤러리형 게시판
  2. 네이버 지도 서비스 기반 부동산 검색 및 매물 마커 표시
  3. 사용자 인터랙션 (상담 예약, 마이페이지/관심 매물 관리)
  4. 공공 API 연동: 실거래가, 공시지가 (공공데이터 포털) 및 토지이음 API (백엔드 Proxy API를 통한 실시간 조회)
  5. 인증 (Authentication): NestJS 백엔드(Passport.js)에서 네이버, 카카오, 구글 소셜 로그인을 전담하여 프론트엔드로 JWT 발급
  6. 권한: 사용자별 권한 등급 및 콘텐츠 접근 제어
- [x] **데이터베이스 활용 고려사항**:
  - Supabase PostgreSQL에서 PostGIS 확장을 활용하여 지리/공간 정보(지도 마커) 쿼리 최적화

## 추가적인 체크 리스트

- [x] 3-Tier 기반 아키텍처 및 폴더 구조 세팅
- [x] 기술 스택 논의 및 결정 완료
  - **프론트엔드 (Frontend)**: Next.js
  - **백엔드 (Backend)**: NestJS
  - **데이터베이스 (Database)**: PostgreSQL
- [x] 인프라 호스팅 및 CI/CD 파이프라인 논의 완료
  - **프론트엔드 호스팅**: Porkbun (정적 호스팅 및 FTP 배포)
  - **백엔드 호스팅**: Railway
  - **데이터베이스 호스팅**: Supabase (PostgreSQL + PostGIS)
  - **CI/CD 플랫폼**: GitHub Actions (코드 푸시 시 Porkbun FTP 및 Railway 자동 배포)
