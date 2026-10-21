import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  getDocFromServer,
  collection,
  getDocs,
  setDoc,
  deleteDoc,
  serverTimestamp,
  query,
  orderBy,
  Timestamp,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { SavedTrip, DayPlan } from '../types';

// 1. Initialize Firebase App
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// 2. Initialize Firestore with the database ID specified in config
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

// 3. Initialize Authentication
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account',
});

// 4. Operation Type and Error Handling conforming to Firebase Skill specification
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// 5. Connection Test
export async function testConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firebase client is offline. Check configuration.');
    }
    return false;
  }
}

// 6. Authentication Helpers
export async function signInWithGoogle(): Promise<User> {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error: any) {
    if (error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request') {
      console.log('User cancelled Google sign-in.');
    } else {
      console.error('Google Sign-in failed:', error);
    }
    throw error;
  }
}

export async function signOutUser(): Promise<void> {
  try {
    await firebaseSignOut(auth);
  } catch (error) {
    console.error('Sign-out failed:', error);
    throw error;
  }
}

// 7. Trip Persistence Functions
export async function saveTripToCloud(params: {
  tripId?: string;
  destinationName: string;
  destinationLat: number;
  destinationLng: number;
  startDate: string;
  daysCount: number;
  days: DayPlan[];
}): Promise<string> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('You must be signed in to save a trip.');
  }

  const tripId = params.tripId || `trip_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const tripPath = `users/${user.uid}/trips/${tripId}`;

  // Sanitize days payload to ensure no undefined values break Firestore serialization
  const sanitizedDays = params.days.map((day) => ({
    dayNumber: day.dayNumber,
    date: day.date || '',
    formattedDate: day.formattedDate || '',
    title: day.title || '',
    theme: day.theme || '',
    items: (day.items || []).map((item) => {
      const cleanItem: Record<string, any> = {
        id: String(item.id || ''),
        time: String(item.time || ''),
        title: String(item.title || ''),
        subtitle: String(item.subtitle || ''),
        category: String(item.category || 'sightseeing'),
        durationMins: Number(item.durationMins || 60),
        locationName: String(item.locationName || ''),
        indoorOutdoor: item.indoorOutdoor || 'outdoor',
        vibe: String(item.vibe || ''),
        status: item.status || 'upcoming',
      };
      if (typeof item.lat === 'number') cleanItem.lat = item.lat;
      if (typeof item.lng === 'number') cleanItem.lng = item.lng;
      if (item.endTime) cleanItem.endTime = item.endTime;
      if (item.notes) cleanItem.notes = item.notes;
      if (item.swapReason) cleanItem.swapReason = item.swapReason;
      if (item.source) cleanItem.source = item.source;
      if (typeof item.osmVerified === 'boolean') cleanItem.osmVerified = item.osmVerified;
      if (item.verifiedAddress) cleanItem.verifiedAddress = item.verifiedAddress;
      if (item.osmId) cleanItem.osmId = item.osmId;
      if (item.osmType) cleanItem.osmType = item.osmType;
      if (item.osmUrl) cleanItem.osmUrl = item.osmUrl;
      if (item.openingHours) cleanItem.openingHours = item.openingHours;
      if (item.osmMetadata) cleanItem.osmMetadata = item.osmMetadata;
      if (typeof item.matchConfidence === 'number') cleanItem.matchConfidence = item.matchConfidence;
      return cleanItem;
    }),
  }));

  try {
    const docRef = doc(db, 'users', user.uid, 'trips', tripId);
    if (params.tripId) {
      // Re-saving / updating existing trip
      const updateData = {
        userId: user.uid,
        destinationName: params.destinationName.slice(0, 200),
        destinationLat: params.destinationLat,
        destinationLng: params.destinationLng,
        startDate: params.startDate.slice(0, 50),
        daysCount: params.daysCount,
        days: sanitizedDays,
        updatedAt: serverTimestamp(),
      };
      await setDoc(docRef, updateData, { merge: true });
    } else {
      // Creating a new saved trip document
      const tripDocData = {
        userId: user.uid,
        destinationName: params.destinationName.slice(0, 200),
        destinationLat: params.destinationLat,
        destinationLng: params.destinationLng,
        startDate: params.startDate.slice(0, 50),
        daysCount: params.daysCount,
        days: sanitizedDays,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await setDoc(docRef, tripDocData);
    }
    return tripId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, tripPath);
  }
}

export async function fetchUserSavedTrips(): Promise<SavedTrip[]> {
  const user = auth.currentUser;
  if (!user) return [];

  const tripsCollectionPath = `users/${user.uid}/trips`;
  try {
    const tripsRef = collection(db, 'users', user.uid, 'trips');
    const q = query(tripsRef, orderBy('updatedAt', 'desc'));
    const snapshot = await getDocs(q);

    return snapshot.docs.map((docSnap) => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        userId: data.userId,
        destinationName: data.destinationName,
        destinationLat: data.destinationLat,
        destinationLng: data.destinationLng,
        startDate: data.startDate,
        daysCount: data.daysCount,
        days: data.days || [],
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      } as SavedTrip;
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, tripsCollectionPath);
  }
}

export async function deleteSavedTrip(tripId: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');

  const tripPath = `users/${user.uid}/trips/${tripId}`;
  try {
    const docRef = doc(db, 'users', user.uid, 'trips', tripId);
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, tripPath);
  }
}

// 8. User Preferences (Language & Settings)
export async function saveUserLanguageToCloud(language: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;

  const userPath = `users/${user.uid}`;
  try {
    const userDocRef = doc(db, 'users', user.uid);
    await setDoc(
      userDocRef,
      {
        language,
        email: user.email || '',
        displayName: user.displayName || '',
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (error) {
    console.warn('Failed to persist language to cloud:', error);
  }
}

export async function fetchUserLanguageFromCloud(): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;

  try {
    const userDocRef = doc(db, 'users', user.uid);
    const snap = await getDoc(userDocRef);
    if (snap.exists()) {
      const data = snap.data();
      if (data && typeof data.language === 'string') {
        return data.language;
      }
    }
  } catch (error) {
    console.warn('Failed to retrieve user language from cloud:', error);
  }
  return null;
}

