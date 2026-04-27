# JuJu 자산관리 - TODO

## DB 스키마 & 백엔드
- [x] DB 스키마 설계 (가계부, 고정지출, 주식, 저축, 연금, 기타자산, 부동산, 블로그체험단)
- [x] Drizzle 마이그레이션 생성 및 적용
- [x] 가계부 CRUD API (tRPC)
- [x] 고정지출 CRUD API
- [x] 주식 포트폴리오 CRUD API
- [x] 저축 및 현금성 자산 CRUD API
- [x] 연금 CRUD API
- [x] 기타 자산 CRUD API
- [x] 부동산 CRUD API
- [x] 블로그 체험단 CRUD API
- [x] 대시보드 집계 API
- [x] 엑셀 마이그레이션 API (제외 - 사용자 요청)

## 프론트엔드 레이아웃 & 디자인
- [x] 글로벌 CSS 변수 및 테마 설정 (Elegant 스타일)
- [x] DashboardLayout 사이드바 네비게이션 구성
- [x] 공통 컴포넌트 (금액 포맷터, 수익률 뱃지, 차트 래퍼)

## 페이지 구현
- [x] 대시보드 페이지 (자산 요약 카드, 월별 수입/지출/저축률 차트)
- [x] 월별 가계부 페이지 (거래 입력/수정/삭제, 분류별 집계)
- [x] 고정지출 관리 페이지 (항목 CRUD, 비율 차트)
- [x] 주식 포트폴리오 페이지 (종목 CRUD, 섹터별 차트)
- [x] 저축 및 현금성 자산 페이지 (항목 CRUD, 합계)
- [x] 연금 관리 페이지 (개인/퇴직연금 CRUD)
- [x] 기타 자산 페이지 (항목 CRUD)
- [x] 부동산 정보 관리 페이지 (아파트 CRUD)
- [x] 블로그 체험단 관리 페이지 (체험단 CRUD)
- [x] 엑셀 마이그레이션 페이지 (제외 - 사용자 요청)

## 데이터 마이그레이션
- [x] 엑셀 → DB 마이그레이션 (제외 - 사용자 요청)

## 테스트
- [x] 백엔드 vitest 테스트 작성 (14 tests passed)
- [x] 최종 UI 검증

## 신규 기능 (2026-04-27)
- [x] DB 스키마: cards 테이블 (대분류, 카드사, 혜택, 연회비, 실적, 용도, 카드한도, 유효기간, 결제일, 결제계좌, 비고)
- [x] DB 스키마: card_points 테이블 (카드/포인트명, 혜택, 재액, 용도)
- [x] 백엔드 API: cards CRUD (list, create, update, delete)
- [x] 백엔드 API: cardPoints CRUD (list, create, update, delete)
- [x] 보유카드 페이지 구현 (신용카드/체크카드 목록, 추가/수정/삭제 다이얼로그)
- [x] 포인트/마일리지 섹션 (카드 페이지 내 탭으로 구성)
- [x] 사이드바에 보유카드 메뉴 추가
- [x] App.tsx 라우트 추가

## 정기결제 서비스 (2026-04-27)
- [x] DB 스키마: subscriptions 테이블 (서비스명, 카테고리, 결제주기, 구독료, 구독시작일, 결제방법, 비고)
- [x] 백엔드 API: subscriptions CRUD (list, create, update, delete)
- [x] 다음결제일 자동계산 로직 (결제주기 기반 서버/클라이언트 계산)
- [x] 월비용/연비용 자동계산 (결제주기 × 구독료)
- [x] 결제방법 - 보유카드 목록 연동 + 현금 + 계좌출금
- [x] 카드 페이지에 정기결제 탭 추가
- [x] 구독 요약 (총 월비용, 총 연비용, 카테고리별 집계)
- [x] 테스트 추가

## 정기결제 페이지 분리 (2026-04-27)
- [x] 보유카드 페이지에서 정기결제 탭 제거
- [x] 독립 Subscriptions.tsx 페이지 생성 (보유카드 데이터 연동)
- [x] 사이드바에 정기결제 메뉴 추가
- [x] App.tsx 라우트 추가

## ETF 현재가 자동 업데이트 (2026-04-27)
- [x] 백엔드 API: etfPrice.getPrice (종목코드 입력 시 Yahoo Finance로 현재가 조회)
- [x] 연금 페이지: ETF 구분 종목에 종목코드 필드 추가
- [x] 연금 페이지: 종목코드 입력 시 자동으로 현재가 조회 버튼/트리거
- [x] 연금 페이지: 현재가 기반 평가금액(현재가 × 수량) 자동 계산
- [x] 연금 페이지: 수익률((평가금액 - 매수원금) / 매수원금 × 100) 자동 계산
- [x] 연금 페이지: 업데이트일 표시
- [x] 테스트 추가

## 주식 포트폴리오 현재가 자동 조회 (2026-04-27)
- [x] StockPortfolio.tsx: 종목코드 필드 추가 (이미 있으면 활용)
- [x] StockPortfolio.tsx: 시장 구분 (한국/해외) 선택 추가
- [x] StockPortfolio.tsx: 현재가 조회 버튼 (etfPrice.getPrice API 재활용)
- [x] StockPortfolio.tsx: 현재가×수량 → 평가금액 자동 계산
- [x] StockPortfolio.tsx: 수익률 자동 계산 ((평가금액-매수원금)/매수원금×100)
- [x] StockPortfolio.tsx: 전체 일괄 업데이트 버튼
- [x] StockPortfolio.tsx: 마지막 업데이트 시각 표시

## 부수입 관리 (2026-04-27)
- [x] DB 스키마: side_income_categories 테이블 (id, name, color, userId, createdAt)
- [x] DB 스키마: side_incomes 테이블 (id, date, categoryId, amount, description, isRegular, note, createdAt)
- [x] 백엔드 API: sideIncomeCategory CRUD (list, create, update, delete)
- [x] 백엔드 API: sideIncome CRUD (list by month, create, update, delete)
- [x] 백엔드 API: 부수입 생성 시 가계부(ledger) 수입 항목 자동 추가
- [x] 부수입 페이지: 카테고리 관리 탭 (추가/수정/삭제)
- [x] 부수입 페이지: 월별 부수입 목록 (날짜, 카테고리, 금액, 정기/비정기, 내용)
- [x] 부수입 페이지: 월별 합계 및 카테고리별 바 차트
- [x] 부수입 페이지: 정기/비정기 비율 차트
- [x] 사이드바에 부수입 메뉴 추가
- [x] App.tsx 라우트 추가
- [x] 테스트 추가
