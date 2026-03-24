-- database/init/03-create-staging-tables.sql
-- 고속 벌크 임포트를 위한 스테이징(임시) 테이블 생성 스크립트

-- 1. 법정동코드 스테이징 테이블 (CSV 임시 적재용)
DROP TABLE IF EXISTS staging_legal_dong_codes;
CREATE UNLOGGED TABLE staging_legal_dong_codes (
    "법정동코드" TEXT,
    "법정동명" TEXT
);

-- 2. 건축물대장 표제부 스테이징 테이블 (CSV의 한글 헤더와 동일)
DROP TABLE IF EXISTS staging_building_info;
CREATE UNLOGGED TABLE staging_building_info (
    "대지위치" TEXT, "시군구코드명" TEXT, "법정동코드명" TEXT, "대지구분코드명" TEXT, "주지번" TEXT, "부지번" TEXT, "특수지명" TEXT, "블록번호" TEXT, "로트번호" TEXT,
    "새주소도로코드명" TEXT, "새주소법정동코드명" TEXT, "새주소지상지하구분코드명" TEXT, "새주소주지번" TEXT, "새주소부지번" TEXT, "건축물대장일련번호" TEXT, "대장구분코드명" TEXT,
    "대장종류코드명" TEXT, "동명" TEXT, "주부속구분코드명" TEXT, "대지면적" TEXT, "건축면적" TEXT, "건폐율" TEXT, "연면적" TEXT, "용적률산정연면적" TEXT, "용적률" TEXT,
    "구조코드명" TEXT, "기타구조정보" TEXT, "주용도코드명" TEXT, "기타용도내용" TEXT, "지붕코드명" TEXT, "기타지붕명" TEXT, "세대수" TEXT, "가구수" TEXT,
    "호수" TEXT, "지상층수" TEXT, "지하층수" TEXT, "높이" TEXT, "승용승강기수" TEXT, "비상용승강기수" TEXT, "부속건축물수" TEXT, "부속건축물면적" TEXT,
    "총동연면적" TEXT, "옥내기계식대수" TEXT, "옥내기계식면적" TEXT, "옥외기계식대수" TEXT, "옥외기계식면적" TEXT, "옥내자주식대수" TEXT, "옥내자주식면적" TEXT,
    "옥외자주식대수" TEXT, "옥외자주식면적" TEXT, "허가일자" TEXT, "착공일자" TEXT, "사용승인일자" TEXT, "에너지효율등급값" TEXT, "에너지절감률" TEXT, "EPI점수" TEXT,
    "친환경건축물등급값" TEXT, "친환경건축물인증점수" TEXT, "지능형건축물등급값" TEXT, "지능형건축물인증점수" TEXT, "내진설계적용여부" TEXT, "내진능력내용" TEXT
);

-- 3. 건축물대장 층별현황 스테이징 테이블
DROP TABLE IF EXISTS staging_floor_status;
CREATE UNLOGGED TABLE staging_floor_status (
    "대지위치" TEXT, "시군구코드명" TEXT, "법정동코드명" TEXT, "대지구분코드명" TEXT, "주지번" TEXT, "부지번" TEXT, "특수지명" TEXT, "블록번호" TEXT, "로트번호" TEXT,
    "새주소도로코드명" TEXT, "새주소법정동코드명" TEXT, "새주소지상지하구분코드명" TEXT, "새주소주지번" TEXT, "새주소부지번" TEXT, "층별개요일련번호" TEXT, "건축물대장일련번호" TEXT,
    "층구분코드명" TEXT, "층번호" TEXT, "층번호명" TEXT, "구조코드명" TEXT, "기타구조정보" TEXT, "주용도코드명" TEXT, "기타용도내용" TEXT, "면적" TEXT,
    "주부속구분코드명" TEXT, "면적제외여부" TEXT
);

-- 4. 상가업소정보 스테이징 테이블
DROP TABLE IF EXISTS staging_store_info;
CREATE UNLOGGED TABLE staging_store_info (
    "상가업소번호" TEXT, "상호명" TEXT, "지점명" TEXT, "상권업종대분류코드" TEXT, "상권업종대분류명" TEXT, "상권업종중분류코드" TEXT, "상권업종중분류명" TEXT, 
    "상권업종소분류코드" TEXT, "상권업종소분류명" TEXT, "표준산업분류코드" TEXT, "표준산업분류명" TEXT, "시도코드" TEXT, "시도명" TEXT, 
    "시군구코드" TEXT, "시군구명" TEXT, "행정동코드" TEXT, "행정동명" TEXT, "법정동코드" TEXT, "법정동명" TEXT, 
    "지번코드" TEXT, "대지구분코드" TEXT, "대지구분명" TEXT, "지번본번지" TEXT, "지번부번지" TEXT, "지번주소" TEXT, 
    "도로명코드" TEXT, "도로명" TEXT, "건물본번지" TEXT, "건물부번지" TEXT, "건물관리번호" TEXT, "건물명" TEXT, 
    "도로명주소" TEXT, "구우편번호" TEXT, "신우편번호" TEXT, "동정보" TEXT, "층정보" TEXT, "호정보" TEXT, 
    "경도" TEXT, "위도" TEXT
);
