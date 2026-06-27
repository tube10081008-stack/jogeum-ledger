# 조금만 가계부 🦕

저축·소비통제에 어려움을 겪는 사람을 위한 **1인용 게이미피케이션 가계부 PWA**.
마스코트 "조구미"와 함께 연 목표를 향해 매일 조금씩.

> "조금만 더 모으자" — 마스코트 **조구미**(오리지널 아기공룡)가 응원합니다.
> ※ '조구만'은 저작권 캐릭터라 바로 못 써서, 분위기만 살린 자체 SVG 마스코트를 넣었어요.
> 정식 에셋을 쓰려면 `js/mascot.js`의 SVG를 이미지로 교체하면 됩니다 (개인 사용).

## 핵심 기능
- 🎯 **연 목표 저축액** 설정 + 진행 링(%)
- ✏️ **수입/지출 빠른 기입** (분류 칩 · 천단위 자동 콤마 · 메모)
- 📅 **예정 항목**(월급·구독료 등)으로 연말 잔액 **미리 예측·통제**
- 🏆 **게이미피케이션**: XP · 레벨 · 연속기록(streak) · 뱃지
- 🦕 **마스코트 반응**: 저축 페이스/연속기록에 따라 표정·멘트 변화
- 📦 **로컬 우선**: 서버·로그인 없음, 오프라인 동작, 데이터는 기기에만 저장 (백업/복원 지원)

## 왜 이 구조인가 (효율적인 배포·업데이트 파이프라인)
- **무빌드 PWA** (순수 HTML/CSS/바닐라 JS) → 빌드 단계 없음
- `ledger/**` 를 push → **GitHub Actions가 GitHub Pages로 자동 배포**
- 폰에서는 **홈 화면에 추가**해두고, 업데이트는 **앱 다시 열기/새로고침**이면 끝
  → 더 이상 zip 다운로드·재설치 루프 없음

## 로컬 실행
```bash
cd ledger
python3 -m http.server 8080
# → http://localhost:8080
```

## 폰에 설치 (배포 후)
1. (최초 1회) 저장소 **Settings → Pages → Source = GitHub Actions**
2. `ledger/**` push → Actions 완료 후 발행 URL 접속
   - 예: `https://tube10081008-stack.github.io/Urge-surfing/`
3. 브라우저 메뉴 → **홈 화면에 추가** → 앱처럼 실행

## 구조
```
ledger/
  index.html              앱 셸 (네비/FAB/시트)
  css/style.css           디자인 토큰 + 컴포넌트
  js/
    format.js             통화/날짜 유틸
    storage.js            로컬 저장 + 분류 정의
    state.js              파생 계산(진행률·페이스·연속일·예측)
    gamification.js       XP·레벨·뱃지
    mascot.js             마스코트 SVG + 기분 로직
    views.js              화면 렌더
    app.js               라우팅·이벤트·PWA 등록
  manifest.webmanifest    PWA 매니페스트
  sw.js                   오프라인 캐시(서비스워커)
```
