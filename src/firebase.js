import { initializeApp, getApps } from 'firebase/app';
import { createUserWithEmailAndPassword, getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { addDoc, collection, doc, getDoc, getFirestore, limit, onSnapshot, orderBy, query, setDoc, where } from 'firebase/firestore';

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

const accountEmail = username => `${username.trim().toLowerCase()}@orchive.app`;
// Firebase는 최소 6자 비밀번호를 요구하므로, 사용자가 정한 4자리 PIN 앞에
// 앱 내부 문자열을 붙여 안전하게 인증 요청을 만듭니다.
const accountPassword = pin => `orchive-pin-${pin}`;

// 아이디만 입력하는 것처럼 보이도록 내부적으로만 안전한 이메일 형식으로 바꿉니다.
export async function signUpWithId(username, password) {
  if (!firebaseEnabled) throw new Error('Firebase 설정이 필요합니다.');
  const credential = await createUserWithEmailAndPassword(auth, accountEmail(username), accountPassword(password));
  return credential.user.uid;
}

export async function signInWithId(username, password) {
  if (!firebaseEnabled) throw new Error('Firebase 설정이 필요합니다.');
  const credential = await signInWithEmailAndPassword(auth, accountEmail(username), accountPassword(password));
  return credential.user.uid;
}

export function watchAuth(callback) {
  if (!firebaseEnabled) { callback(null); return () => {}; }
  return onAuthStateChanged(auth, user => callback(user));
}

export async function signOutUser() { if (auth) await signOut(auth); }

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

const conversationId = (first, second) => [first, second].sort().join('_');

export async function sendFriendRequest(from, to, senderName) {
  if (!db || !from || !to || from === to) return;
  await setDoc(doc(db, 'friendRequests', `${from}_${to}`), {
    from, to, senderName, status: 'pending', createdAt: Date.now()
  });
}

export async function sendDirectMessage(from, to, text) {
  if (!db || !from || !to || !text.trim()) return;
  const id = conversationId(from, to);
  await setDoc(doc(db, 'conversations', id), { participants: [from, to], updatedAt: Date.now() }, { merge: true });
  await addDoc(collection(db, 'conversations', id, 'messages'), { from, text: text.trim(), createdAt: Date.now() });
}

export function subscribeDirectMessages(first, second, callback) {
  if (!db || !first || !second) return () => {};
  const id = conversationId(first, second);
  return onSnapshot(query(collection(db, 'conversations', id, 'messages'), orderBy('createdAt', 'asc'), limit(100)), snapshot => callback(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))));
}
