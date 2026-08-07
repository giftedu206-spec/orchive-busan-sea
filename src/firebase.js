import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { addDoc, collection, doc, getDoc, getFirestore, limit, onSnapshot, orderBy, query, setDoc } from 'firebase/firestore';

// Firebase 웹 설정값은 공개 식별자이며, 실제 데이터 보호는 Firestore 보안 규칙으로 합니다.
const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

export const firebaseEnabled = Boolean(config.apiKey && config.projectId && config.appId);
const app = firebaseEnabled ? (getApps()[0] || initializeApp(config)) : null;
const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;

export async function connectFirebase() {
  if (!firebaseEnabled) return null;
  const credential = await signInAnonymously(auth);
  return credential.user.uid;
}

export async function loadCloudData(uid) {
  const snapshot = await getDoc(doc(db, 'orchiveUsers', uid));
  return snapshot.exists() ? snapshot.data() : null;
}

export async function saveCloudData(uid, data) {
  await setDoc(doc(db, 'orchiveUsers', uid), { ...data, updatedAt: Date.now() }, { merge: true });
}

// Firebase Storage 대신 사진을 작게 압축해 Firestore에 바로 저장합니다.
// 무료 Spark 요금제에서도 쓸 수 있지만, Firestore 문서 크기는 1 MiB를 넘을 수 없습니다.
export async function compressImageForFirestore(dataUrl) {
  if (!dataUrl?.startsWith('data:image/')) return dataUrl;

  const image = new Image();
  image.src = dataUrl;
  await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; });

  for (const [maxSize, quality] of [[720, 0.72], [600, 0.62], [480, 0.52]]) {
    const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    const compressed = canvas.toDataURL('image/jpeg', quality);
    // Other discovery fields also need room inside the 1 MiB Firestore document.
    if (compressed.length < 650000) return compressed;
  }
  throw new Error('사진이 너무 커서 무료 공유용으로 압축할 수 없어요. 다른 사진을 선택해 주세요.');
}

// 공개 지도용 발견 기록은 모든 사용자가 읽을 수 있는 별도 컬렉션에 저장합니다.
export async function publishDiscovery(uid, item, imageData) {
  const image = await compressImageForFirestore(imageData || item.image);
  const shared = { ...item, image, authorId: uid, createdAt: Date.now() };
  const record = await addDoc(collection(db, 'publicDiscoveries'), shared);
  return { ...shared, id: record.id };
}

export function subscribePublicDiscoveries(callback) {
  if (!firebaseEnabled) return () => {};
  // 시민이 공유한 최신 기록을 넉넉히 보여 주되, 무료 Firestore 읽기 사용량도 고려합니다.
  const latest = query(collection(db, 'publicDiscoveries'), orderBy('createdAt', 'desc'), limit(100));
  return onSnapshot(latest, snapshot => callback(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))));
}
