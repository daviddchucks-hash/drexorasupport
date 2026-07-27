import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  type User,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

// Firebase browser configuration is safe to ship in a client app. Security
// comes from Firebase Authentication and Firestore Security Rules, not from
// hiding these public project identifiers.
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? 'AIzaSyA1wX_0tastbk_hWfI0_cvuV9ZzoIKitL4',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? 'drexorasupport.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? 'drexorasupport',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? 'drexorasupport.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '669148105903',
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? '1:669148105903:web:69641657318107bf1a185a',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID ?? 'G-5M2CGWLDND',
};

export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);
export const demoMode = !isFirebaseConfigured;
export const firebaseApp = isFirebaseConfigured
  ? (getApps()[0] ?? initializeApp(firebaseConfig))
  : null;
export const auth = firebaseApp ? getAuth(firebaseApp) : null;
export const db = firebaseApp ? getFirestore(firebaseApp) : null;

export type RegistrationInput = {
  email: string;
  password: string;
  name: string;
  businessName: string;
};

function requireFirebase() {
  if (!auth || !db) {
    throw new Error('Firebase is not configured for this workspace.');
  }
  return { auth, db };
}

export async function registerBusiness(input: RegistrationInput): Promise<User> {
  const { auth: firebaseAuth, db: firestore } = requireFirebase();
  const credential = await createUserWithEmailAndPassword(firebaseAuth, input.email, input.password);
  await updateProfile(credential.user, { displayName: input.name });

  const businessId = `${input.businessName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 28) || 'business'}-${credential.user.uid.slice(0, 6)}`;
  await Promise.all([
    setDoc(doc(firestore, 'Users', credential.user.uid), {
      uid: credential.user.uid,
      email: input.email,
      name: input.name,
      businessId,
      role: 'owner',
      createdAt: serverTimestamp(),
    }),
    setDoc(doc(firestore, 'Businesses', businessId), {
      id: businessId,
      name: input.businessName,
      ownerId: credential.user.uid,
      logoUrl: '',
      createdAt: serverTimestamp(),
    }),
    setDoc(doc(firestore, 'Settings', businessId), {
      businessId,
      primaryColor: '#9e92ec',
      welcomeMessage: `Hi, I'm Nova. How can I help?`,
      chatTitle: 'Nova from Drexora',
      widgetPosition: 'right',
      updatedAt: serverTimestamp(),
    }),
    setDoc(doc(firestore, 'FAQs', `${businessId}-welcome`), {
      businessId,
      question: 'What is Drexora Support?',
      answer: 'Drexora Support helps your team answer customer questions, collect leads, and keep every conversation moving.',
      category: 'General',
      views: 0,
      createdAt: serverTimestamp(),
    }),
  ]);
  return credential.user;
}

export async function loginBusiness(email: string, password: string): Promise<User> {
  const { auth: firebaseAuth } = requireFirebase();
  const credential = await signInWithEmailAndPassword(firebaseAuth, email, password);
  return credential.user;
}

export async function getBusinessIdForUser(uid: string): Promise<string | null> {
  const { db: firestore } = requireFirebase();
  const userSnapshot = await getDoc(doc(firestore, 'Users', uid));
  return userSnapshot.exists() ? (userSnapshot.data().businessId as string) : null;
}

export async function loadBusinessFaqs(businessId: string) {
  const { db: firestore } = requireFirebase();
  const snapshot = await getDocs(collection(firestore, 'FAQs'));
  return snapshot.docs
    .map((item) => ({ id: item.id, ...item.data() }) as { id: string; businessId?: string })
    .filter((item) => item.businessId === businessId);
}

export async function saveWidgetSettings(
  businessId: string,
  settings: { primaryColor: string; welcomeMessage: string; chatTitle: string; widgetPosition: string },
) {
  const { db: firestore } = requireFirebase();
  await updateDoc(doc(firestore, 'Settings', businessId), {
    ...settings,
    updatedAt: serverTimestamp(),
  });
}