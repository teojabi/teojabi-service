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
| `02-public-data.sql` | 공공데이터 및 건축물대장 테이블 생성 |
| `03-create-staging-tables.sql` | 스테이징 임시 테이블 생성 |
| `04-import-from-staging-tables.sql` | 스테이징 데이터 정제 및 이관 |

### 3.2 실행 단계

**Step 1: 스테이징 테이블 생성 (03번)**
```bash
psql -h [HOST] -U [USER] -d [DATABASE] -f database/init/03-create-staging-tables.sql
```

**Step 2: CSV 벌크 로드 (\copy)**
```bash
# 법정동코드 (예시)
psql -h [HOST] -U [USER] -d [DATABASE] -c "\copy staging_legal_dong_codes FROM 'database/법정동코드 조회자료.csv' WITH (FORMAT CSV, HEADER, ENCODING 'EUC-KR', QUOTE '\"', NULL '')"

# 표제부 (예시)
psql -h [HOST] -U [USER] -d [DATABASE] -c "\copy staging_building_info FROM 'staging_building_info.csv' WITH (FORMAT CSV, HEADER, ENCODING 'UTF8', NULL '')"

# 토지이용계획정보
psql -h [HOST] -U [USER] -d [DATABASE] -c "\copy staging_land_use_plan FROM 'database/staging_land_use_plan.csv' WITH (FORMAT CSV, HEADER, ENCODING 'UTF8', NULL '')"
```

**Step 3: 데이터 변환 및 이관 (04번)**
스테이징 데이터를 정제 및 19자리 PNU로 조합하여 실제 운영 테이블로 `UPSERT` 합니다.
```bash
psql -h [HOST] -U [USER] -d [DATABASE] -f database/init/04-import-from-staging-tables.sql
```

---

## 4. 정기 갱신 (Python 스케줄러)

### 4.1 배치 스크립트 (`database/pythonDataHandler/`)

기존 NestJS에서 수행하던 배치 로직을 Python으로 분리하여 관리합니다. 외부 스케줄러(예: Linux CRON, Windows Task Scheduler) 또는 독립적인 Python 프로세스를 통해 주기적으로 실행됩니다.

| 항목 | 설명 |
|---|---|
| 실행 위치 | `database/pythonDataHandler/` |
| 주요 언어 | Python 3.x |
| 실행 방식 | `python main.py` (또는 해당 스크립트 실행) |
| 환경 설정 | `.env` 또는 환경 변수를 통한 DB 접속 정보 관리 |

### 4.2 실행 흐름

```
1. 스케줄러에 의한 Python 스크립트 실행
    │
    ▼
2. 스테이징 테이블 생성 (psql 또는 DB Driver 활용)
    │
    ▼
3. CSV 벌크 로드 (psql \copy 또는 COPY 명령어) — 초고속 임포트
    │
    ▼
4. 운영 테이블로 UPSERT (INSERT ON CONFLICT)
    │
    ▼
5. 스테이징 테이블 삭제 + ANALYZE
```

### 4.3 Python 분리 장점

- **백엔드 독립성**: 대용량 데이터 처리 시 백엔드(NestJS) 리소스와 분리하여 성능 영향을 최소화합니다.
- **유지보수 용이성**: 데이터 처리 로직을 파이썬의 강력한 라이브러리(Pandas 등)를 활용하여 더 유연하게 확장할 수 있습니다.
- **배포 유연성**: 백엔드 서버와 별도로 배치 서버를 운영하거나 서버리스 환경에서 실행하기 유리합니다.

---

## 5. Docker 환경 설정

Docker를 사용하는 경우, `psql` 클라이언트 설치를 Dockerfile에 추가합니다:

```dockerfile
RUN apt-get update && apt-get install -y postgresql-client
```

---

## 6. 운영 주의사항

- **파일명 영문화**: CSV 파일명은 반드시 영문 사용 (`staging_building_info.csv`)
- **Python 환경**: `database/pythonDataHandler` 내의 가상환경(venv) 및 패키지 관리 권장
- **메모리/디스크**: 대량 변환 시 일시적 디스크 사용량 증가 주의
- **기대 성능**: 수십만 건 데이터를 수 초 이내 처리 (일반 INSERT 대비 수백 배 빠름)
