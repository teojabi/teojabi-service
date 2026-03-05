# 터잡이 서비스 (Teojabi Service) 요구사항 및 정보 기록

이 문서는 멘토와 멘티 간의 대화를 바탕으로 프로젝트에 필요한 요소, 확인된 정보, 체크해야 할 기록 등을 지속적으로 업데이트하기 위한 용도로 작성되었습니다.

## 논의 중/확인된 항목

- [ ] **API 연동을 위한 키 관리 방안**:
  - 프론트엔드 (Next.js): 환경변수(`NEXT_PUBLIC_...`)를 통한 안전한 키 관리 및 노출 방지 전략
  - 백엔드 (NestJS): `.env` 파일 및 Config 서비스 (또는 AWS Secrets Manager/GitHub Secrets 활용)
- [ ] **주요 핵심 기능 정의**: (서비스의 가장 핵심이 되는 기능을 나열해 주세요)
- [ ] **Supabase 활용 고려사항**:
  - 데이터베이스 (PostgreSQL) 직접 연결 가이드라인 수립 (NestJS에서 Prisma 또는 TypeORM을 통한 연동)
  - Supabase Auth (인증/인가) 기능 사용 여부 확인
  - Supabase Storage 활용 여부 (이미지 등 정적 파일 업로드용)
## 추가적인 체크 리스트

- [x] 3-Tier 기반 아키텍처 및 폴더 구조 세팅
- [x] 기술 스택 논의 및 결정 완료
  - **프론트엔드 (Frontend)**: Next.js
  - **백엔드 (Backend)**: NestJS
  - **데이터베이스 (Database)**: PostgreSQL
- [x] 인프라 호스팅 및 CI/CD 파이프라인 논의 완료
  - **프론트엔드 호스팅**: Porkbun 호스팅 사용
  - **백엔드 호스팅**: 
  - **데이터베이스 호스팅**: Supabase
  - **CI/CD 플랫폼**: GitHub Actions (프론트/백 별도 Workflow 설정)
