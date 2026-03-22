# 공공데이터 배치 적재 및 CRON 운영 가이드

이 문서는 서울시 건축물대장 등 대량의 공공데이터를 서비스 DB에 고속으로 적재하고, 정기적으로 갱신하는 배치 시스템의 운영 가이드입니다.

---

## 1. 개요

대량의 CSV 데이터를 효율적으로 처리하기 위해 **TEXT 기반 스테이징 테이블**을 거쳐 운영 테이블로 이관하는 전략을 사용합니다.

```
CSV 파일 → psql \copy → 스테이징 테이블(TEXT) → 운영 테이블(타입 변환) → ANALYZE
```

---

## 2. 사전 요구사항

| 항목 | 요구사항 |
|---|---|
| **psql 클라이언트** | 서비스 실행 환경에 설치 필수 |
| **환경 변수** | DB 접속 정보 (Host, User, DB Name, Password) |
| **CSV 파일** | 영문 파일명 사용 필수 (한글 경로 인코딩 문제 방지) |
| **디스크 공간** | 대량 데이터 변환 시 일시적 증가를 고려한 충분한 공간 |

---

## 3. 최초 일괄 적재 (Bulk Load — One Time Job)

서비스 오픈 전 빈 화면을 방지하기 위해 1회 수행합니다.

### 3.1 SQL 스크립트 구성 (`database/init/`)

| 파일 | 용도 |
|---|---|
| `01-schema.sql` | 기본 스키마 생성 |
| `02-public-data.sql` | 공공데이터 테이블 생성 |
| `03-building-data.sql` | 건축물대장 테이블 생성 |
| `04-import-data.sql` | 데이터 임포트 (기본) |
| `05-optimized-import.sql` | 최적화된 스테이징 임포트 |
| `06-full-import-optimized.sql` | 전체 최적화 임포트 |

### 3.2 실행 단계

**Step 1: 법정동코드 기초 데이터 적재 (04번)**
```bash
# 스테이징 생성 및 이관 쿼리 실행
psql -h [HOST] -U [USER] -d [DATABASE] -f database/init/04-import-data.sql

# CSV 고속 로드 (\copy)
psql -h [HOST] -U [USER] -d [DATABASE] -c "\copy staging_legal_dong_codes FROM 'database/법정동코드 조회자료.csv' WITH (FORMAT CSV, HEADER, ENCODING 'EUC-KR', QUOTE '\"', NULL '')"
```

**Step 2: 스테이징 테이블 생성 (05번)**
```bash
psql -h [HOST] -U [USER] -d [DATABASE] -f database/init/05-optimized-import.sql
```

**Step 3: CSV 벌크 로드 (\copy)**
```bash
# 표제부 (예시)
psql -h [HOST] -U [USER] -d [DATABASE] -c "\copy staging_building_info FROM 'staging_building_info.csv' WITH (FORMAT CSV, HEADER, ENCODING 'UTF8', NULL '')"
```

**Step 4: 데이터 변환 및 이관 (06번)**
스테이징 데이터를 정제 및 19자리 PNU로 조합하여 실제 운영 테이블로 `UPSERT` 합니다.
```bash
psql -h [HOST] -U [USER] -d [DATABASE] -f database/init/06-full-import-optimized.sql
```

---

## 4. 정기 갱신 (CRON 스케줄러)

### 4.1 배치 서비스 (`backend/src/public-data/public-data-batch.service.ts`)

NestJS의 `@nestjs/schedule` 모듈을 사용하여 주기적으로 실행됩니다.

| 설정 | 값 |
|---|---|
| 실행 주기 | 매주 일요일 새벽 3시 |
| Cron 표현식 | `0 3 * * 0` |
| 실행 방식 | `child_process` → `psql` 호출 |
| 인증 방식 | `PGPASSWORD` 환경변수 (셸 명령에 비밀번호 미노출) |

### 4.2 실행 흐름

```
1. CRON 트리거 발동 (매주 일요일 새벽 3시)
    │
    ▼
2. 스테이징 테이블 생성 (psql -f)
    │
    ▼
3. CSV 벌크 로드 (psql \copy) — 초고속 임포트
    │
    ▼
4. 운영 테이블로 UPSERT (INSERT ON CONFLICT)
    │
    ▼
5. 스테이징 테이블 삭제 + ANALYZE
```

### 4.3 주요 코드 구조

```typescript
import { exec } from 'child_process';
import { promisify } from 'util';
const execPromise = promisify(exec);

async function runPsqlCopy(filePath: string, tableName: string) {
  const command = `psql -h ${host} -U ${user} -d ${database} -c "\\copy ${tableName} FROM '${filePath}' WITH (FORMAT CSV, HEADER, ENCODING 'UTF8', NULL '')"`;

  const { stdout, stderr } = await execPromise(command, {
    env: { ...process.env, PGPASSWORD: process.env.DATABASE_PASSWORD }
  });
}
```

---

## 5. Docker 환경 설정

Docker를 사용하는 경우, `psql` 클라이언트 설치를 Dockerfile에 추가합니다:

```dockerfile
RUN apt-get update && apt-get install -y postgresql-client
```

---

## 6. 운영 주의사항

- **psql 경로 확인**: `public-data-batch.service.ts`의 `psqlPath`가 실제 환경과 일치하는지 확인
- **파일명 영문화**: CSV 파일명은 반드시 영문 사용 (`staging_building_info.csv`)
- **메모리/디스크**: 대량 변환 시 일시적 디스크 사용량 증가 주의
- **기대 성능**: 수십만 건 데이터를 수 초 이내 처리 (일반 INSERT 대비 수백 배 빠름)
