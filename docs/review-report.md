# 기획/설계 문서 교차 검토 리포트 (Review Report)

현재까지 작성된 `RESEARCH.md`, `spec.md`, `infra.md`, `schema-design.md`, `api-design.md`, `frontend-design.md` 문서들을 기반으로 상호 일관성 및 실제 구현 시 누락되거나 충돌할 수 있는 사항들을 면밀히 검토한 결과입니다.

## 1. 프론트엔드 배포 방식과 렌더링 방식의 충돌 (Critical)
*   **문제점**: `infra.md`와 `frontend-design.md`를 보면 **Next.js 14 App Router**를 사용하며 "정적 리소스 내보내기(`output: 'export'`)"를 통해 **Porkbun FTP 방식**으로 배포하기로 결정했습니다. 
*   **충돌 요인**:
    *   NextAuth.js (소셜 로그인) 및 동적 라우팅/API Route(`app/api/auth/[...nextauth]`) 기능들은 **Node.js 서버(SSR)** 환경이 필수적입니다.
    *   정적 HTML(`output: 'export'`) 환경에서는 NextAuth.js의 서버 사이드 기능(세션 관리, 콜백 처리 등)을 사용할 수 없습니다.
*   **해결 방안 제안**:
    1.  **방안 A (추천)**: 인증 처리를 Next.js(NextAuth)에서 완전히 분리하여 **NestJS 백엔드**에서 Passport.js 등으로 소셜 로그인을 전담하고, 프론트엔드는 단순 JWT 토큰만 저장하는 방식으로 변경. (이 경우 프론트엔드는 완벽한 정적 파일 배포가 가능)
    2.  **방안 B**: Porkbun 호스팅이 정적(Static) 호스팅이 아닌, Node.js 앱 호스팅 환경을 지원하는지 확인하여 SSR 배포로 계획 수정.

## 2. API와 스키마 설계 간의 데이터 구조 불일치 (Moderate)
*   **문제점**: `schema-design.md`의 `Property` 모델에는 공공데이터(공시지가, 실거래가)를 저장하는 필드(`officialPrice`, `actualPrice`)가 정의되어 있습니다. 반면 `api-design.md`에는 프론트엔드가 백엔드 Proxy API(`/api/v1/public/...`)를 통해 실시간으로 해당 데이터를 조회하는 구조로 명세되어 있습니다.
*   **고려사항**:
    *   공공데이터를 DB(Supabase)에 주기적으로 캐싱하여 저장할 것인지, 아니면 매번 실시간으로 Proxy API를 통해 가져올 것인지 하나의 정책으로 통일하거나 명확한 캐싱 주기를 정의해야 합니다.

## 3. PostGIS와 Prisma 연동의 복잡성 (Moderate)
*   **문제점**: `schema-design.md`에 `location Unsupported("geometry(Point, 4326)")`가 선언되어 있습니다.
*   **고려사항**:
    *   Prisma는 PostGIS의 Point 타입을 네이티브 객체로 완벽히 지원하지 않기 때문에, `api-design.md`에 정의된 반경 검색 API(`/api/v1/properties/map`)를 구현할 때 Prisma의 `$queryRaw`를 사용해 생 쿼리(Raw SQL)를 다뤄야 합니다. 이는 개발 시 타입 안정성이 떨어질 수 있음을 미리 인지해야 합니다.

## 4. 로컬 환경과 배포 환경(CI/CD) 문서화 오류
*   **수정 필요 사항**: `spec.md`의 3번 항목 폴더 구조에서 `database/docker-compose.yml` 리스트가 남아있습니다. 초기에 논의했던 방식에서 현재는 Supabase를 사용하기로 변경 (`infra.md` 반영완료)하였으므로, `spec.md`의 로컬 DB 도커 설정 부분은 제거 또는 "Supabase Local CLI" 등으로 수정해야 앞뒤가 맞습니다.

## 총평 및 다음 단계 제안
가장 시급히 결정해야 할 부분은 **"1번. NextAuth.js와 정적 배포(Porkbun FTP) 간의 기술적 충돌"**입니다. 이 부분에 대한 아키텍처 결정을 확정해 주시면 설계 문서를 일관성 있게 일괄 수정하겠습니다.
