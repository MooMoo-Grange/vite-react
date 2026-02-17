# 🥊 배틀 다이어트 v1.1 — MooMoo Ranch Edition

운동 & 식단 루틴 통합 다이어트 베팅 앱

## 빠른 시작 (로컬 개발)

```bash
# 1. 의존성 설치
npm install

# 2. 개발 서버 실행
npm run dev

# → 브라우저에서 http://localhost:3000 자동 오픈
```

## 배포용 빌드

```bash
# 빌드 실행
npm run build

# → dist/ 폴더에 배포 가능한 파일 생성됨
```

## 배포 방법

### Netlify (드래그앤드롭 — 가장 간편)
1. `npm run build` 실행
2. [app.netlify.com/drop](https://app.netlify.com/drop) 접속
3. `dist` 폴더를 드래그앤드롭
4. 완료! URL 즉시 생성

### Vercel
1. GitHub에 이 프로젝트 push
2. [vercel.com](https://vercel.com)에서 Import
3. Framework: Vite 자동 감지 → Deploy

### GitHub Pages
1. `vite.config.js`에 `base: '/저장소이름/'` 추가
2. `npm run build`
3. `dist` 폴더를 gh-pages 브랜치로 push

### Cloudflare Pages
1. GitHub 연결
2. Build command: `npm run build`
3. Output directory: `dist`

## 기능 요약

- 📊 **대시보드**: 참가자별 감량 현황, 12주 로드맵
- 🗓️ **루틴**: 하루 타임라인, 간헐적 단식, 수분/수면/목장활동
- 🍽️ **식단**: 운동일/비운동일 식단, 칼로리/단백질 추적
- 💪 **운동**: 요일별 운동 프로그램, Zone 2 가이드
- ⚖️ **기록**: 체중 기록 + 스파크라인 차트
- 🎯 **미션**: 주간 미션 체크리스트
- 🏆 **랭킹**: 리더보드 + 상금 분배
- ⚙️ **관리**: 참가자/설정/체성분 기준

## 기술 스택

- React 18 + Vite 5
- 순수 inline CSS (외부 라이브러리 없음)
- localStorage 기반 데이터 저장
