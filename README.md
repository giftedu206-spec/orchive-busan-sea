# Orchive

부산 바다 생물을 시민이 사진으로 기록하고, AI 분석 결과와 발견 지도를 함께 만드는 반응형 웹 앱입니다.

## 실행

```bash
npm install
npm run dev
```

브라우저에서 표시된 주소(보통 `http://127.0.0.1:5173/`)를 엽니다.

## Firebase 사진 공유 방식

이 프로젝트는 **Firebase Storage를 사용하지 않습니다.** 사진을 브라우저에서 최대 720px JPEG로 압축한 뒤 Firestore의 `publicDiscoveries`에 저장합니다. 그래서 Storage 결제 없이 다른 사용자의 발견이 지도에 나타납니다.

- Firestore 문서 제한 때문에 너무 큰 사진은 등록 전에 자동으로 더 압축합니다.
- 그래도 1 MiB 제한을 넘으면 다른 사진을 선택하라는 안내가 표시됩니다.
- 예전에 등록되어 깨진 사진은 복구할 수 없으므로, 새 사진으로 다시 등록해야 합니다.

Firestore 규칙에는 아래 `publicDiscoveries` 항목이 있어야 공유 지도가 작동합니다.

```text
match /publicDiscoveries/{discoveryId} {
  allow read: if request.auth != null;
  allow create: if request.auth != null
    && request.resource.data.authorId == request.auth.uid;
  allow update, delete: if request.auth != null
    && resource.data.authorId == request.auth.uid;
}
```

## 파일 구조

```text
src/
├─ assets/orchive-logo.png  # 고래 브랜드 로고
├─ firebase.js              # 익명 로그인, Firestore 개인/공개 데이터
├─ main.jsx                 # 화면 컴포넌트와 앱 흐름
└─ styles.css               # 반응형 UI와 브랜드 디자인
```
