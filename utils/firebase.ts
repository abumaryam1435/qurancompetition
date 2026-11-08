import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
  getFirestore,
  Firestore,
  doc,
  setDoc,
  getDoc,
  onSnapshot,
  getDocFromServer,
  enableNetwork,
  disableNetwork,
  Unsubscribe,
} from 'firebase/firestore';
import { getAuth, Auth } from 'firebase/auth';

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

/**
 * إعدادات الاتصال الفعلي الموحد بقاعدة بيانات Firebase Firestore
 * لضمان التزامن الفوري بين المشرف وجميع المقيمين من أي جهاز وفي أي متصفح
 */
export const HARDCODED_FIREBASE_CONFIG = {
  projectId: 'gen-lang-client-0771338279',
  appId: '1:986460731792:web:3cf70dd5fc1c9de5c25b15',
  apiKey: 'AIzaSyCUGuWaBPSPzml1aNV72cCE3W7SSNhlf-0',
  authDomain: 'gen-lang-client-0771338279.firebaseapp.com',
  firestoreDatabaseId: 'ai-studio-remix-2ad91edb-ceab-4036-8e8f-76ea7ae2321a',
  storageBucket: 'gen-lang-client-0771338279.firebasestorage.app',
  messagingSenderId: '986460731792',
  measurementId: '',
  oAuthClientId: '986460731792-fsvugnkfbmrdpfpeiq6doi5gl0ef9sph.apps.googleusercontent.com',
  recaptchaSiteKey: '',
};

let firebaseApp: FirebaseApp;
if (getApps().length > 0) {
  firebaseApp = getApp();
} else {
  firebaseApp = initializeApp(HARDCODED_FIREBASE_CONFIG);
}

/* CRITICAL: The app will break without this line */
export const rawFirestore: Firestore = getFirestore(
  firebaseApp,
  HARDCODED_FIREBASE_CONFIG.firestoreDatabaseId
);
export const auth: Auth = getAuth(firebaseApp);

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map(provider => ({
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

/**
 * Validate Connection to Firestore on boot
 */
export async function testFirestoreConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(rawFirestore, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firestore offline: Please check your Firebase configuration.');
      return false;
    }
    // Any response from the server (even document not found) confirms connectivity
    return true;
  }
}

// Test connection on startup
testFirestoreConnection().catch(() => {});

export const sanitizeForFirebase = (obj: any): any => {
  if (obj === undefined) return null;
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeForFirebase(item));
  }
  const cleaned: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) {
      cleaned[k] = sanitizeForFirebase(v);
    }
  }
  return cleaned;
};

const normalizeToArray = (val: any): any[] => {
  if (!val) return [];
  if (Array.isArray(val)) return val.filter(item => item !== null && item !== undefined);
  if (typeof val === 'object') {
    return Object.values(val).filter(item => item !== null && item !== undefined);
  }
  return [];
};

const broadcastChannel =
  typeof window !== 'undefined' && 'BroadcastChannel' in window
    ? new BroadcastChannel('quran_competition_firestore_sync')
    : null;

/**
 * محول فوري حقيقي (Realtime Adapter) يعمل فوق Firestore بمزامنة لحظية كاملة onSnapshot
 * مدعوم بإعادة اتصال تلقائي عند انقطاع الاتصال أو خمول شاشة الهاتف، مع فحص نبض دوري خلفي
 * لضمان التزامن المباشر والفوري 100% بين جميع المقيمين والمشرفين على Netlify وأي استضافة.
 */
class FirestoreRealtimeDbAdapter {
  private listeners: Map<string, Set<(snap: { val: () => any; exists: () => boolean }) => void>> =
    new Map();
  private unsubs: Map<string, Unsubscribe> = new Map();
  private isOnline = true;
  private memoryCache: Record<string, any> = {};
  private lastCompUpdatedAt = 0;
  private isHeartbeatRunning = false;

  constructor() {
    this.initDocListeners();
    this.initBroadcastChannel();
    this.startBackgroundHeartbeat();
  }

  private markConnected() {
    if (!this.isOnline) {
      this.isOnline = true;
    }
    this.notify('.info/connected', true);
  }

  private initBroadcastChannel() {
    if (!broadcastChannel) return;
    broadcastChannel.onmessage = event => {
      try {
        const { path, value, updatedAt } = event.data || {};
        if (path && value !== undefined) {
          if (path === 'data/competitions' && updatedAt && updatedAt <= this.lastCompUpdatedAt) {
            return;
          }
          if (updatedAt) this.lastCompUpdatedAt = updatedAt;
          this.memoryCache[path] = value;
          this.notify(path, value);
        }
      } catch (e) {
        console.warn('Broadcast channel sync note:', e);
      }
    };
  }

  private initDocListeners() {
    this.listenToCompetitions();
    this.listenToConfig();
    this.listenToUsers();
    this.listenToEvaluators();
  }

  public listenToCompetitions() {
    if (this.unsubs.has('appData/competitions')) {
      try {
        this.unsubs.get('appData/competitions')!();
      } catch {}
      this.unsubs.delete('appData/competitions');
    }

    const compDoc = doc(rawFirestore, 'appData', 'competitions');
    const unsubComp = onSnapshot(
      compDoc,
      snapshot => {
        this.markConnected();
        if (!snapshot.exists()) return;
        const data = snapshot.data();
        const serverUpdatedAt = Number(data?.updatedAt || 0);
        this.lastCompUpdatedAt = serverUpdatedAt;
        const list = normalizeToArray(data?.list);
        this.memoryCache['data/competitions'] = list;
        this.notify('data/competitions', list);
        this.notify('data', {
          competitions: list,
          users: this.memoryCache['data/users'] || [],
          globalEvaluators: this.memoryCache['data/globalEvaluators'] || [],
        });
      },
      err => {
        console.warn('Competitions realtime snapshot note (auto-reconnecting):', err?.message || err);
        // إعادة الاشتراك التلقائي بعد ثانية في حال نوم الشاشة أو تقلب اتصال الجوال
        setTimeout(() => {
          this.listenToCompetitions();
        }, 1500);
      }
    );
    this.unsubs.set('appData/competitions', unsubComp);
  }

  private listenToConfig() {
    if (this.unsubs.has('appConfig/main')) {
      try {
        this.unsubs.get('appConfig/main')!();
      } catch {}
      this.unsubs.delete('appConfig/main');
    }

    const configDoc = doc(rawFirestore, 'appConfig', 'main');
    const unsubCfg = onSnapshot(
      configDoc,
      snapshot => {
        this.markConnected();
        if (!snapshot.exists()) return;
        const cfg = snapshot.data() || {};
        this.memoryCache['config'] = cfg;
        this.notify('config', cfg);
        if (cfg.appName !== undefined) this.notify('config/appName', cfg.appName);
        if (cfg.customLogo !== undefined) this.notify('config/customLogo', cfg.customLogo);
        if (cfg.supervisorPassword !== undefined)
          this.notify('config/supervisorPassword', cfg.supervisorPassword);
      },
      err => {
        console.warn('Config realtime snapshot note (auto-reconnecting):', err?.message || err);
        setTimeout(() => this.listenToConfig(), 2000);
      }
    );
    this.unsubs.set('appConfig/main', unsubCfg);
  }

  private listenToUsers() {
    if (this.unsubs.has('appData/users')) {
      try {
        this.unsubs.get('appData/users')!();
      } catch {}
      this.unsubs.delete('appData/users');
    }

    const userDoc = doc(rawFirestore, 'appData', 'users');
    const unsubUsers = onSnapshot(
      userDoc,
      snapshot => {
        this.markConnected();
        if (!snapshot.exists()) return;
        const data = snapshot.data();
        const list = normalizeToArray(data?.list);
        this.memoryCache['data/users'] = list;
        this.notify('data/users', list);
        this.notify('data', {
          competitions: this.memoryCache['data/competitions'] || [],
          users: list,
          globalEvaluators: this.memoryCache['data/globalEvaluators'] || [],
        });
      },
      err => {
        console.warn('Users realtime snapshot note (auto-reconnecting):', err?.message || err);
        setTimeout(() => this.listenToUsers(), 2000);
      }
    );
    this.unsubs.set('appData/users', unsubUsers);
  }

  private listenToEvaluators() {
    if (this.unsubs.has('appData/evaluators')) {
      try {
        this.unsubs.get('appData/evaluators')!();
      } catch {}
      this.unsubs.delete('appData/evaluators');
    }

    const evaluatorsDoc = doc(rawFirestore, 'appData', 'evaluators');
    const unsubEvaluators = onSnapshot(
      evaluatorsDoc,
      snapshot => {
        this.markConnected();
        if (!snapshot.exists()) return;
        const data = snapshot.data();
        const list = normalizeToArray(data?.list);
        this.memoryCache['data/globalEvaluators'] = list;
        this.notify('data/globalEvaluators', list);
        this.notify('data/evaluators', list);
      },
      err => {
        console.warn('Evaluators realtime snapshot note (auto-reconnecting):', err?.message || err);
        setTimeout(() => this.listenToEvaluators(), 2000);
      }
    );
    this.unsubs.set('appData/evaluators', unsubEvaluators);
  }

  /**
   * فحص نبض دوري بالخلفية كل ثانيتين للتأكد من مطابقة بيانات السيرفر اللحظية
   * حتى لو قام متصفح الهاتف أو Netlify بتعليق اتصال السوكيت مؤقتاً
   */
  private startBackgroundHeartbeat() {
    if (typeof window === 'undefined' || this.isHeartbeatRunning) return;
    this.isHeartbeatRunning = true;

    const pullServerCompetitions = async () => {
      if (!navigator.onLine || !this.isOnline) return;
      try {
        const compDoc = doc(rawFirestore, 'appData', 'competitions');
        const snap = await getDocFromServer(compDoc);
        if (snap.exists()) {
          const data = snap.data();
          const serverUpdated = Number(data?.updatedAt || 0);
          if (serverUpdated > this.lastCompUpdatedAt) {
            this.lastCompUpdatedAt = serverUpdated;
            const list = normalizeToArray(data?.list);
            this.memoryCache['data/competitions'] = list;
            this.notify('data/competitions', list);
            this.notify('data', {
              competitions: list,
              users: this.memoryCache['data/users'] || [],
              globalEvaluators: this.memoryCache['data/globalEvaluators'] || [],
            });
          }
        }
      } catch {}
    };

    // فحص منتظم كل 2.5 ثانية
    setInterval(() => {
      pullServerCompetitions();
    }, 2500);

    // إنعاش فوري بمجرد تنشيط الشاشة أو عودة الاتصال أو التركيز على التطبيق
    const handleWakeup = () => {
      enableNetwork(rawFirestore).catch(() => {});
      this.initDocListeners();
      pullServerCompetitions();
    };

    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        handleWakeup();
      }
    });
    window.addEventListener('focus', handleWakeup);
    window.addEventListener('online', handleWakeup);
  }

  private notify(cleanPath: string, value: any) {
    const cbs = this.listeners.get(cleanPath);
    if (!cbs || cbs.size === 0) return;
    const snap = {
      val: () => (value !== undefined ? value : null),
      exists: () => value !== null && value !== undefined,
    };
    cbs.forEach(cb => {
      try {
        cb(snap);
      } catch (e) {
        console.error('Realtime callback error:', e);
      }
    });
  }

  public goOnline() {
    this.isOnline = true;
    enableNetwork(rawFirestore).catch(() => {});
    this.notify('.info/connected', true);
  }

  public goOffline() {
    this.isOnline = false;
    disableNetwork(rawFirestore).catch(() => {});
    this.notify('.info/connected', false);
  }

  private async fetchDocPreferServer(docRef: ReturnType<typeof doc>) {
    try {
      return await getDocFromServer(docRef);
    } catch {
      return await getDoc(docRef);
    }
  }

  public ref(pathStr: string = '') {
    const cleanPath = String(pathStr || '').replace(/^\/+|\/+$/g, '');

    return {
      on: (
        _eventType: string,
        callback: (snap: { val: () => any; exists: () => boolean }) => void,
        _errorCallback?: (err: any) => void
      ) => {
        if (!this.listeners.has(cleanPath)) {
          this.listeners.set(cleanPath, new Set());
        }
        this.listeners.get(cleanPath)!.add(callback);

        if (cleanPath === '.info/connected') {
          setTimeout(() => {
            callback({
              val: () => navigator.onLine && this.isOnline,
              exists: () => true,
            });
          }, 0);
          return callback;
        }

        // إرجاع القيمة المخبأة فوراً إن وجدت
        const cachedVal = this.memoryCache[cleanPath];
        if (cachedVal !== undefined) {
          setTimeout(() => {
            callback({
              val: () => cachedVal,
              exists: () => cachedVal !== null && cachedVal !== undefined,
            });
          }, 0);
        } else if (cleanPath === 'data') {
          const comps = this.memoryCache['data/competitions'];
          const users = this.memoryCache['data/users'];
          const evals = this.memoryCache['data/globalEvaluators'];
          if (comps !== undefined || users !== undefined || evals !== undefined) {
            setTimeout(() => {
              callback({
                val: () => ({
                  competitions: comps || [],
                  users: users || [],
                  globalEvaluators: evals || [],
                }),
                exists: () => true,
              });
            }, 0);
          }
        }

        return callback;
      },

      once: async (
        _eventType: string,
        callback?: (snap: { val: () => any; exists: () => boolean }) => void
      ) => {
        let resultVal: any = null;
        try {
          if (cleanPath === 'data') {
            const [compSnap, userSnap, evalSnap] = await Promise.all([
              this.fetchDocPreferServer(doc(rawFirestore, 'appData', 'competitions')),
              this.fetchDocPreferServer(doc(rawFirestore, 'appData', 'users')),
              this.fetchDocPreferServer(doc(rawFirestore, 'appData', 'evaluators')),
            ]);
            const comps = compSnap.exists() ? normalizeToArray(compSnap.data()?.list) : undefined;
            const users = userSnap.exists() ? normalizeToArray(userSnap.data()?.list) : undefined;
            const evals = evalSnap.exists() ? normalizeToArray(evalSnap.data()?.list) : undefined;

            if (comps !== undefined) this.memoryCache['data/competitions'] = comps;
            if (users !== undefined) this.memoryCache['data/users'] = users;
            if (evals !== undefined) this.memoryCache['data/globalEvaluators'] = evals;

            if (comps !== undefined || users !== undefined || evals !== undefined) {
              resultVal = {
                competitions: comps ?? this.memoryCache['data/competitions'] ?? [],
                users: users ?? this.memoryCache['data/users'] ?? [],
                globalEvaluators: evals ?? this.memoryCache['data/globalEvaluators'] ?? [],
              };
            }
          } else if (cleanPath === 'data/competitions') {
            const snap = await this.fetchDocPreferServer(doc(rawFirestore, 'appData', 'competitions'));
            if (snap.exists()) {
              const list = normalizeToArray(snap.data()?.list);
              this.memoryCache['data/competitions'] = list;
              resultVal = list;
            }
          } else if (cleanPath === 'config') {
            const snap = await this.fetchDocPreferServer(doc(rawFirestore, 'appConfig', 'main'));
            if (snap.exists()) {
              resultVal = snap.data() || {};
              this.memoryCache['config'] = resultVal;
            }
          } else if (cleanPath === 'data/users') {
            const snap = await this.fetchDocPreferServer(doc(rawFirestore, 'appData', 'users'));
            if (snap.exists()) {
              resultVal = normalizeToArray(snap.data()?.list);
              this.memoryCache['data/users'] = resultVal;
            }
          } else if (cleanPath === 'data/globalEvaluators' || cleanPath === 'data/evaluators') {
            const snap = await this.fetchDocPreferServer(doc(rawFirestore, 'appData', 'evaluators'));
            if (snap.exists()) {
              resultVal = normalizeToArray(snap.data()?.list);
              this.memoryCache['data/globalEvaluators'] = resultVal;
            }
          }
        } catch (e) {
          resultVal = this.memoryCache[cleanPath] || null;
        }

        const snapshot = {
          val: () => resultVal,
          exists: () => resultVal !== null && resultVal !== undefined,
        };

        if (callback) callback(snapshot);
        return snapshot;
      },

      off: (_eventType?: string, callback?: any) => {
        if (callback) {
          this.listeners.get(cleanPath)?.delete(callback);
        } else {
          this.listeners.delete(cleanPath);
        }
      },

      set: async (value: any) => {
        const sanitized = sanitizeForFirebase(value);
        this.memoryCache[cleanPath] = sanitized;
        this.notify(cleanPath, sanitized);

        try {
          if (cleanPath === 'data/competitions') {
            const listToSave = normalizeToArray(sanitized);
            const now = Date.now();
            this.lastCompUpdatedAt = now;
            this.memoryCache['data/competitions'] = listToSave;
            if (broadcastChannel) {
              try {
                broadcastChannel.postMessage({
                  path: 'data/competitions',
                  value: listToSave,
                  updatedAt: now,
                });
              } catch {}
            }
            await setDoc(doc(rawFirestore, 'appData', 'competitions'), {
              list: listToSave,
              updatedAt: now,
            });
          } else if (cleanPath.startsWith('data/competitions/')) {
            const subId = cleanPath.replace('data/competitions/', '');
            let currentList: any[] = normalizeToArray(this.memoryCache['data/competitions']);
            const index = currentList.findIndex((item: any) => String(item?.id) === String(subId));
            if (value === null) {
              currentList = currentList.filter((item: any) => String(item?.id) !== String(subId));
            } else if (index > -1) {
              currentList[index] = sanitized;
            } else {
              currentList.push(sanitized);
            }
            const now = Date.now();
            this.lastCompUpdatedAt = now;
            this.memoryCache['data/competitions'] = currentList;
            if (broadcastChannel) {
              try {
                broadcastChannel.postMessage({
                  path: 'data/competitions',
                  value: currentList,
                  updatedAt: now,
                });
              } catch {}
            }
            await setDoc(doc(rawFirestore, 'appData', 'competitions'), {
              list: currentList,
              updatedAt: now,
            });
          } else if (cleanPath === 'config') {
            await setDoc(
              doc(rawFirestore, 'appConfig', 'main'),
              {
                ...sanitized,
                updatedAt: Date.now(),
              },
              { merge: true }
            );
          } else if (cleanPath.startsWith('config/')) {
            const field = cleanPath.replace('config/', '');
            await setDoc(
              doc(rawFirestore, 'appConfig', 'main'),
              {
                [field]: sanitized,
                updatedAt: Date.now(),
              },
              { merge: true }
            );
          } else if (cleanPath === 'data/users') {
            const listToSave = normalizeToArray(sanitized);
            this.memoryCache['data/users'] = listToSave;
            await setDoc(doc(rawFirestore, 'appData', 'users'), {
              list: listToSave,
              updatedAt: Date.now(),
            });
          } else if (cleanPath === 'data/globalEvaluators' || cleanPath === 'data/evaluators') {
            const listToSave = normalizeToArray(sanitized);
            this.memoryCache['data/globalEvaluators'] = listToSave;
            await setDoc(doc(rawFirestore, 'appData', 'evaluators'), {
              list: listToSave,
              updatedAt: Date.now(),
            });
          } else if (cleanPath === 'data') {
            if (sanitized && typeof sanitized === 'object') {
              if (sanitized.competitions !== undefined) {
                const compsList = normalizeToArray(sanitized.competitions);
                this.memoryCache['data/competitions'] = compsList;
                await setDoc(doc(rawFirestore, 'appData', 'competitions'), {
                  list: compsList,
                  updatedAt: Date.now(),
                });
              }
              if (sanitized.users !== undefined) {
                const usersList = normalizeToArray(sanitized.users);
                this.memoryCache['data/users'] = usersList;
                await setDoc(doc(rawFirestore, 'appData', 'users'), {
                  list: usersList,
                  updatedAt: Date.now(),
                });
              }
              if (sanitized.globalEvaluators !== undefined || sanitized.evaluators !== undefined) {
                const evalList = normalizeToArray(
                  sanitized.globalEvaluators || sanitized.evaluators
                );
                this.memoryCache['data/globalEvaluators'] = evalList;
                await setDoc(doc(rawFirestore, 'appData', 'evaluators'), {
                  list: evalList,
                  updatedAt: Date.now(),
                });
              }
            }
          }
        } catch (err) {
          console.error('Firestore Realtime set error:', err);
          handleFirestoreError(err, OperationType.WRITE, cleanPath);
        }
      },

      remove: async () => {
        delete this.memoryCache[cleanPath];
        this.notify(cleanPath, null);
        try {
          if (cleanPath === 'data/competitions') {
            await setDoc(doc(rawFirestore, 'appData', 'competitions'), {
              list: [],
              updatedAt: Date.now(),
            });
          }
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, cleanPath);
        }
      },
    };
  }
}

// إنشاء مثيل وحيد للمحول الفوري المباشر لقاعدة بيانات Firestore
const realtimeAdapterInstance = new FirestoreRealtimeDbAdapter();

export const getDb = () => {
  return realtimeAdapterInstance;
};

export const getStorage = () => {
  return null;
};

export const disconnectFirebase = async () => {
  try {
    realtimeAdapterInstance.goOffline();
  } catch (e) {
    console.warn('Error disconnecting firebase:', e);
  }
};

export const getFirebaseConfig = (): any => {
  return HARDCODED_FIREBASE_CONFIG;
};

export const saveFirebaseConfig = (_config: any): void => {
  // موحد تلقائياً مع قاعدة بيانات Firestore المعتمدة
};

export const initFirebase = (_config?: any): boolean => {
  realtimeAdapterInstance.goOnline();
  return true;
};

export const smartParseFirebaseConfig = (_input: string): any => {
  return HARDCODED_FIREBASE_CONFIG;
};

export const createSupervisorAutoCloudConfig = (_supervisorIdentifier?: string) => {
  return HARDCODED_FIREBASE_CONFIG;
};
