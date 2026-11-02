import React, { useState, useMemo, createContext, useCallback, useEffect, useRef } from 'react';
import {
  User,
  UserRole,
  FullBackupData,
  Competition,
  GlobalEvaluator,
} from './types';
import {
  INITIAL_USERS,
  DEFAULT_APP_NAME,
  DEFAULT_FAVICON_URL,
  REMEMBERED_LOGIN_PASSWORD_KEY,
  REMEMBER_ME_PREFERENCE_KEY,
  CUSTOM_LOGO_KEY,
} from './constants';
import { safeLocalStorage } from './utils/storage';
import LoginScreen from './components/LoginScreen';
import { SupervisorDashboard } from './components/SupervisorDashboard';
import EvaluatorDashboard from './components/competition/EvaluatorDashboard';
import Header from './components/Header';
import MobileInstallModal from './components/MobileInstallModal';
import ChangePasswordModal from './components/ChangePasswordModal';
import {
  initFirebase,
  getDb,
  getFirebaseConfig,
  saveFirebaseConfig,
  sanitizeForFirebase,
  disconnectFirebase,
  smartParseFirebaseConfig,
} from './utils/firebase';
import { initSwipeNavigation } from './utils/navigationHistory';

initSwipeNavigation();

declare global {
  interface Window {
    embeddedAppData?: string;
    isSnapshotMode?: boolean;
  }
}

interface ToastMessage {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface SyncTask {
  path: string;
  value: any;
  timestamp: number;
}

const base64ToUtf8 = (str: string): string => {
  try {
    const binaryString = atob(str);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  } catch (e) {
    return '';
  }
};

const toArray = <T,>(val: any): T[] => {
  if (!val) return [];
  if (Array.isArray(val)) return val.filter(item => item !== null && item !== undefined);
  if (typeof val === 'object') return Object.values(val).filter(item => item !== null && item !== undefined) as T[];
  return [];
};

const normalizeCompetition = (c: any): Competition => ({
  id: String(c?.id || Date.now()),
  name: c?.name || 'مسابقة قرآنية',
  isActive: Boolean(c?.isActive),
  passageMode:
    c?.passageMode === 'international' || c?.passageMode === 'manual' || c?.passageMode === 'random'
      ? c.passageMode
      : 'random',
  previewLinesPerSegment: Number(c?.previewLinesPerSegment) > 0 ? Number(c.previewLinesPerSegment) : undefined,
  manualPassages: toArray<any>(c?.manualPassages)
    .filter(mp => mp && Number(mp.juzNumber) >= 1 && Number(mp.juzNumber) <= 30)
    .map((mp, idx) => ({
      id: String(mp.id || `mp-${mp.juzNumber}-${idx}-${Date.now()}`),
      juzNumber: Number(mp.juzNumber),
      startSurahId: Number(mp.startSurahId || 1),
      startAyah: Number(mp.startAyah || 1),
      endSurahId: Number(mp.endSurahId || mp.startSurahId || 1),
      endAyah: Number(mp.endAyah || mp.startAyah || 1),
      notes: mp.notes ? String(mp.notes) : undefined,
    })),
  levels: toArray<any>(c?.levels).map(l => ({
    ...l,
    id: Number(l?.id || Date.now()),
    segmentsCount: Number(l?.segmentsCount || 3),
    linesPerSegment: Number(l?.linesPerSegment || 7),
    maxScore: Number(l?.maxScore || 100),
    errors: toArray<any>(l?.errors),
  })),
  evaluators: toArray<any>(c?.evaluators).map(ev => ({
    ...ev,
    id: Number(ev?.id || Date.now()),
    levelIds: toArray<number>(ev?.levelIds).map(Number),
  })),
  participants: toArray<any>(c?.participants).map(p => ({
    ...p,
    id: Number(p?.id || Date.now()),
    levelId: Number(p?.levelId || 0),
    isUnmemorized: Boolean(p?.isUnmemorized),
  })),
  evaluations: toArray<any>(c?.evaluations).map(ev => ({
    ...ev,
    id: Number(ev?.id || Date.now()),
    participantId: Number(ev?.participantId || 0),
    evaluatorId: Number(ev?.evaluatorId || 0),
    levelId: Number(ev?.levelId || 0),
    totalScore: Number(ev?.totalScore || 0),
    timestamp: Number(ev?.timestamp || Date.now()),
    notes: ev?.notes ? String(ev.notes) : undefined,
    isUnmemorized: Boolean(ev?.isUnmemorized),
    segments: toArray<any>(ev?.segments).map((seg, idx) => ({
      ...seg,
      segmentNumber: Number(seg?.segmentNumber || idx + 1),
      score: Number(seg?.score || 0),
      isUnmemorized: Boolean(seg?.isUnmemorized),
      errorsCount: seg?.errorsCount && typeof seg.errorsCount === 'object' ? seg.errorsCount : {},
    })),
  })),
});

interface AppDataState {
  users: User[];
  competitions: Competition[];
}

export interface AppContextType {
  users: User[];
  competitions: Competition[];
  updateCompetitions: (competitions: Competition[]) => void;
  globalEvaluators: GlobalEvaluator[];
  updateGlobalEvaluators: (evaluators: GlobalEvaluator[]) => void;
  activeCompetitionId: string | null;
  setActiveCompetitionId: (id: string | null) => void;
  isSyncing: boolean;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  deleteAllData: () => void;
  customLogo: string | null;
  setCustomLogo: (logo: string | null) => void;
  importFullBackup: (backupData: FullBackupData) => void;
  supervisorPassword: string;
  setSupervisorPassword: (password: string) => void;
  logout: () => void;
  initiateLogoutCheck: () => void;
  isLoading: boolean;
  isLoadingFirebase: boolean;
  appName: string;
  setAppName: (name: string) => void;
  darkMode: boolean;
  toggleDarkMode: () => void;
  firebaseConnectionStatus: 'connected' | 'connecting' | 'disconnected' | 'offline';
  firebaseConfig: any;
  setFirebaseConfig: (config: any) => void;
  isDistributable: boolean;
  isPublishedConnected: boolean;
  currentUser: User | null;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  disconnectFirebaseDatabase: () => void;
}

export const AppContext = createContext<AppContextType | null>(null);

const APP_DATA_KEY = 'competitionAppData';
const SUPERVISOR_PASSWORD_KEY = 'competitionSupervisorPassword';
const APP_NAME_KEY = 'competitionAppName';
const DARK_MODE_KEY = 'competitionDarkMode';
const SYNC_QUEUE_KEY = 'competitionSyncQueue';
const CURRENT_USER_KEY = 'competitionCurrentUser';
const SESSION_TIMESTAMP_KEY = 'competitionSessionTimestamp';
const SESSION_TIMEOUT_MS = 24 * 60 * 60 * 1000;

let embeddedData: Partial<FullBackupData> | null = null;
if (window.embeddedAppData) {
  try {
    const jsonString = base64ToUtf8(window.embeddedAppData);
    if (jsonString) {
      embeddedData = JSON.parse(jsonString);
      if (embeddedData?.firebaseConfig && (embeddedData.firebaseConfig.apiKey || embeddedData.firebaseConfig.databaseURL)) {
        saveFirebaseConfig(embeddedData.firebaseConfig);
      }
    }
  } catch (e) {}
}

// التقاط رابط التفعيل السحري (?fbSync=...) لتفعيل Firebase تلقائياً للمقيمين والمشرفين بضغطة واحدة
try {
  const urlParams = new URLSearchParams(window.location.search);
  const fbSyncParam = urlParams.get('fbSync');
  if (fbSyncParam) {
    const decodedJson = base64ToUtf8(fbSyncParam);
    const parsedFromUrl = smartParseFirebaseConfig(decodedJson || fbSyncParam);
    if (parsedFromUrl && (parsedFromUrl.apiKey || parsedFromUrl.databaseURL || parsedFromUrl.roomId)) {
      saveFirebaseConfig(parsedFromUrl);
      const cleanUrl = window.location.origin + window.location.pathname + window.location.hash;
      window.history.replaceState({}, document.title, cleanUrl);
    }
  }
} catch (e) {}

const getInitialState = (): {
  data: AppDataState;
  logo: string | null;
  supPass: string;
  appName: string;
  isDist: boolean;
  isPubConn: boolean;
  fbConfig: any;
} => {
  const currentSavedFbConfig = getFirebaseConfig();

  if (embeddedData) {
    return {
      data: {
        users: toArray<User>(embeddedData.users).length ? toArray<User>(embeddedData.users) : INITIAL_USERS,
        competitions: toArray<Competition>((embeddedData as any).competitions).map(normalizeCompetition),
      },
      logo: embeddedData.customLogo || null,
      supPass: embeddedData.supervisorPassword || '123',
      appName: embeddedData.appName || DEFAULT_APP_NAME,
      isDist: !!embeddedData.isDistributable,
      isPubConn: !!embeddedData.isPublishedConnected,
      fbConfig: currentSavedFbConfig,
    };
  }

  let savedData: Partial<AppDataState> = {};
  try {
    const raw = safeLocalStorage.getItem(APP_DATA_KEY) || safeLocalStorage.getItem('halaqaAppData');
    if (raw) savedData = JSON.parse(raw);
  } catch (e) {}

  let savedComp: Competition[] = [];
  try {
    const rawComp = safeLocalStorage.getItem('competitions');
    if (rawComp) savedComp = JSON.parse(rawComp);
  } catch (e) {}

  const initialComps = toArray<Competition>((savedData as any).competitions || savedComp).map(normalizeCompetition);

  return {
    data: {
      users: toArray<User>(savedData.users).length ? toArray<User>(savedData.users) : INITIAL_USERS,
      competitions: initialComps,
    },
    logo: safeLocalStorage.getItem(CUSTOM_LOGO_KEY) || null,
    supPass: safeLocalStorage.getItem(SUPERVISOR_PASSWORD_KEY) || '123',
    appName: safeLocalStorage.getItem(APP_NAME_KEY) || DEFAULT_APP_NAME,
    isDist: false,
    isPubConn: false,
    fbConfig: currentSavedFbConfig || null,
  };
};

const App: React.FC = () => {
  const initialState = useMemo(() => getInitialState(), []);

  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    try {
      const savedUser = safeLocalStorage.getItem(CURRENT_USER_KEY);
      const savedTimestamp = safeLocalStorage.getItem(SESSION_TIMESTAMP_KEY);

      if (savedUser && savedTimestamp) {
        const now = Date.now();
        const sessionStart = parseInt(savedTimestamp, 10);
        if (now - sessionStart < SESSION_TIMEOUT_MS) {
          return JSON.parse(savedUser);
        } else {
          safeLocalStorage.removeItem(CURRENT_USER_KEY);
          safeLocalStorage.removeItem(SESSION_TIMESTAMP_KEY);
        }
      }
      return null;
    } catch (e) {
      return null;
    }
  });

  const [data, setData] = useState<AppDataState>(initialState.data);
  const [activeCompetitionId, setActiveCompetitionIdState] = useState<string | null>(() => {
    const saved = safeLocalStorage.getItem('activeCompetitionId');
    if (saved) return saved;
    const comps = initialState.data.competitions || [];
    const active = comps.find(c => c.isActive);
    return active ? active.id : comps[0]?.id || null;
  });

  const setActiveCompetitionId = useCallback((id: string | null) => {
    setActiveCompetitionIdState(id);
    if (id) safeLocalStorage.setItem('activeCompetitionId', id);
    else safeLocalStorage.removeItem('activeCompetitionId');
  }, []);

  const [globalEvaluators, setGlobalEvaluatorsState] = useState<GlobalEvaluator[]>(() => {
    try {
      const raw = safeLocalStorage.getItem('competitionGlobalEvaluators');
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    const map = new Map<string, GlobalEvaluator>();
    const comps = initialState.data.competitions || [];
    comps.forEach(c => {
      (c.evaluators || []).forEach(e => {
        if (e.name && !map.has(e.name.trim().toLowerCase())) {
          map.set(e.name.trim().toLowerCase(), {
            id: e.id || Date.now() + Math.floor(Math.random() * 1000),
            name: e.name.trim(),
            pin: e.pin || '1234',
            createdAt: Date.now(),
          });
        }
      });
    });
    return Array.from(map.values());
  });

  const [customLogo, setCustomLogoState] = useState<string | null>(initialState.logo);
  const [supervisorPassword, setSupervisorPasswordState] = useState<string>(initialState.supPass);
  const [appName, setAppNameState] = useState<string>(initialState.appName);
  const [darkMode, setDarkMode] = useState<boolean>(() => safeLocalStorage.getItem(DARK_MODE_KEY) === 'true');
  const [showMobileInstallModal, setShowMobileInstallModal] = useState(false);
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);

  const [isLoading] = useState(false);
  const [isLoadingFirebase, setIsLoadingFirebase] = useState<boolean>(
    () => (initialState.data.competitions || []).length === 0
  );

  // تظليل النص بالكامل تلقائياً عند النقر أو التركيز على أي خانة كتابة أو رقم أو كلمة مرور في التطبيق
  useEffect(() => {
    const isSelectableInput = (
      target: EventTarget | null
    ): target is HTMLInputElement | HTMLTextAreaElement => {
      if (!target || !(target instanceof HTMLElement)) return false;
      if (target instanceof HTMLTextAreaElement) {
        return !target.readOnly && !target.disabled;
      }
      if (target instanceof HTMLInputElement) {
        const nonTextTypes = new Set([
          'checkbox',
          'radio',
          'file',
          'button',
          'submit',
          'reset',
          'range',
          'color',
          'hidden',
          'image',
        ]);
        return !nonTextTypes.has(target.type) && !target.readOnly && !target.disabled;
      }
      return false;
    };

    const selectEntireField = (el: HTMLInputElement | HTMLTextAreaElement) => {
      try {
        el.select();
      } catch {}
      requestAnimationFrame(() => {
        try {
          if (document.activeElement === el) {
            el.select();
          }
        } catch {}
      });
      setTimeout(() => {
        try {
          if (document.activeElement === el) {
            el.select();
          }
        } catch {}
      }, 25);
    };

    const handleFocusIn = (e: FocusEvent) => {
      if (!isSelectableInput(e.target)) return;
      const el = e.target;
      el.dataset.autoSelectOnClick = '1';
      selectEntireField(el);
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (!isSelectableInput(e.target)) return;
      const el = e.target;
      if (el.dataset.autoSelectOnClick === '1') {
        e.preventDefault();
        selectEntireField(el);
      }
    };

    const handleClick = (e: MouseEvent) => {
      if (!isSelectableInput(e.target)) return;
      const el = e.target;
      if (el.dataset.autoSelectOnClick === '1') {
        delete el.dataset.autoSelectOnClick;
        selectEntireField(el);
        return;
      }
      // إذا نقر المستخدم على خانة كتابة أو خصم أو كلمة مرور ولم يكن هناك نص مظلل، نظللها بالكامل
      try {
        const hasSelection =
          typeof el.selectionStart === 'number' &&
          typeof el.selectionEnd === 'number' &&
          el.selectionEnd > el.selectionStart;
        if (!hasSelection) {
          el.select();
        }
      } catch {
        try {
          el.select();
        } catch {}
      }
    };

    document.addEventListener('focusin', handleFocusIn, true);
    document.addEventListener('mouseup', handleMouseUp, true);
    document.addEventListener('click', handleClick, true);
    return () => {
      document.removeEventListener('focusin', handleFocusIn, true);
      document.removeEventListener('mouseup', handleMouseUp, true);
      document.removeEventListener('click', handleClick, true);
    };
  }, []);

  const [firebaseConnectionStatus, setFirebaseConnectionStatus] = useState<
    'connected' | 'connecting' | 'disconnected' | 'offline'
  >('connected');
  const [firebaseConfigState, setFirebaseConfigState] = useState<any>(() => getFirebaseConfig());
  const [isDistributable] = useState<boolean>(initialState.isDist);
  const [isPublishedConnected] = useState<boolean>(initialState.isPubConn);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const [syncQueue, setSyncQueue] = useState<SyncTask[]>(() => {
    try {
      const savedQueue = safeLocalStorage.getItem(SYNC_QUEUE_KEY);
      return savedQueue ? JSON.parse(savedQueue) : [];
    } catch {
      return [];
    }
  });

  const isProcessingQueue = useRef(false);

  const writeData = useCallback(
    async (path: string, value: any) => {
      if (path === 'data/globalEvaluators' || path === 'data/evaluators') {
        const evals = toArray<GlobalEvaluator>(value);
        setGlobalEvaluatorsState(evals);
        safeLocalStorage.setItem('competitionGlobalEvaluators', JSON.stringify(evals));
      }

      setData(prev => {
        const parts = path.split('/');
        if (parts[0] === 'data' && parts[1]) {
          const collection = parts[1] as keyof AppDataState;
          const idStr = parts[2];

          if (!idStr) {
            if (collection === 'competitions') {
              return { ...prev, competitions: toArray<Competition>(value).map(normalizeCompetition) };
            }
            return { ...prev, [collection]: toArray<any>(value) };
          }

          const currentList = [...(prev[collection] || [])];
          const itemId = isNaN(Number(idStr)) ? idStr : Number(idStr);

          if (value === null) {
            return { ...prev, [collection]: currentList.filter((item: any) => item && item.id !== itemId) };
          } else {
            const index = currentList.findIndex((item: any) => item && item.id === itemId);
            if (index > -1) currentList[index] = value;
            else currentList.push(value);
            return { ...prev, [collection]: currentList };
          }
        }
        return prev;
      });

      if (firebaseConfigState?.isAutoCloud && firebaseConfigState?.roomId) {
        const roomId = firebaseConfigState.roomId;
        try {
          const res = await fetch(`/api/realtime-sync/${encodeURIComponent(roomId)}/set`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path, value: sanitizeForFirebase(value) }),
          });
          if (!res.ok) throw new Error('Sync request failed');
        } catch {
          setSyncQueue(prev => [...prev.filter(t => t.path !== path), { path, value, timestamp: Date.now() }]);
        }
        return;
      }

      const db = getDb();
      if (db) {
        try {
          if (value === null) await db.ref(path).remove();
          else await db.ref(path).set(sanitizeForFirebase(value));
          setFirebaseConnectionStatus('connected');
        } catch (err) {
          setSyncQueue(prev => [...prev.filter(t => t.path !== path), { path, value, timestamp: Date.now() }]);
        }
      } else if (firebaseConfigState && (firebaseConfigState.apiKey || firebaseConfigState.databaseURL)) {
        setSyncQueue(prev => [...prev.filter(t => t.path !== path), { path, value, timestamp: Date.now() }]);
      }
    },
    [firebaseConfigState]
  );

  const updateGlobalEvaluators = useCallback(
    (newList: GlobalEvaluator[]) => {
      setGlobalEvaluatorsState(newList);
      safeLocalStorage.setItem('competitionGlobalEvaluators', JSON.stringify(newList));
      writeData('data/globalEvaluators', newList);
    },
    [writeData]
  );

  useEffect(() => {
    if (!currentUser) return;
    const checkSessionInterval = setInterval(() => {
      const savedTimestamp = safeLocalStorage.getItem(SESSION_TIMESTAMP_KEY);
      if (savedTimestamp) {
        const now = Date.now();
        const sessionStart = parseInt(savedTimestamp, 10);
        if (now - sessionStart >= SESSION_TIMEOUT_MS) {
          handleLogout();
          showToast('انتهت الجلسة لمرور 24 ساعة، يرجى تسجيل الدخول مجدداً.', 'info');
        }
      }
    }, 60 * 1000);

    return () => clearInterval(checkSessionInterval);
  }, [currentUser]);

  useEffect(() => {
    const isValidFb =
      firebaseConfigState &&
      (firebaseConfigState.apiKey || firebaseConfigState.databaseURL || firebaseConfigState.roomId);

    if (isValidFb) {
      saveFirebaseConfig(firebaseConfigState);
      if (firebaseConfigState.isAutoCloud && firebaseConfigState.roomId) {
        setFirebaseConnectionStatus('connecting');
      } else if (initFirebase(firebaseConfigState)) {
        setFirebaseConnectionStatus('connected');
      } else {
        setFirebaseConnectionStatus('disconnected');
        setIsLoadingFirebase(false);
      }
    } else {
      setFirebaseConnectionStatus('disconnected');
      setIsLoadingFirebase(false);
    }
  }, [firebaseConfigState]);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  useEffect(() => {
    try {
      safeLocalStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(syncQueue));
    } catch (e) {}
  }, [syncQueue]);

  useEffect(() => {
    if (firebaseConnectionStatus === 'connected' && syncQueue.length > 0 && !isProcessingQueue.current) {
      isProcessingQueue.current = true;
      const processQueue = async () => {
        const currentQueue = [...syncQueue];

        if (firebaseConfigState?.isAutoCloud && firebaseConfigState?.roomId) {
          const roomId = firebaseConfigState.roomId;
          const remainingTasks: SyncTask[] = [];
          for (const task of currentQueue) {
            try {
              const res = await fetch(`/api/realtime-sync/${encodeURIComponent(roomId)}/set`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: task.path, value: sanitizeForFirebase(task.value) }),
              });
              if (!res.ok) remainingTasks.push(task);
            } catch {
              remainingTasks.push(task);
            }
          }
          setSyncQueue(remainingTasks);
          isProcessingQueue.current = false;
          return;
        }

        const db = getDb();
        if (!db) {
          isProcessingQueue.current = false;
          return;
        }

        const remainingTasks: SyncTask[] = [];
        for (const task of currentQueue) {
          try {
            if (task.value === null) {
              await db.ref(task.path).remove();
            } else {
              await db.ref(task.path).set(sanitizeForFirebase(task.value));
            }
          } catch (err) {
            remainingTasks.push(task);
          }
        }
        setSyncQueue(remainingTasks);
        isProcessingQueue.current = false;
      };
      processQueue();
    }
  }, [firebaseConnectionStatus, syncQueue, firebaseConfigState]);

  useEffect(() => {
    const isAutoCloud = Boolean(firebaseConfigState?.isAutoCloud && firebaseConfigState?.roomId);
    const hasCustomFb = Boolean(firebaseConfigState && (firebaseConfigState.apiKey || firebaseConfigState.databaseURL));

    if (!isAutoCloud && !hasCustomFb) {
      setFirebaseConnectionStatus('disconnected');
      setIsLoadingFirebase(false);
      return;
    }

    // الوضع السحابي الفوري التلقائي بضغطة زر لكل مشرف (Auto-Cloud SSE)
    if (isAutoCloud) {
      const roomId = firebaseConfigState.roomId;
      let es: EventSource | null = null;
      let isMounted = true;

      const applyRoomPayload = (payload: any) => {
        if (!isMounted || !payload) return;
        const d = payload.data || {};
        const cfg = payload.config || {};

        if (d.competitions !== undefined) {
          const incomingComps = toArray<Competition>(d.competitions).map(normalizeCompetition);
          setData(prev => ({ ...prev, competitions: incomingComps }));
          setActiveCompetitionIdState(prevId => {
            if (prevId && incomingComps.some(c => c.id === prevId)) return prevId;
            const active = incomingComps.find(c => c.isActive);
            return active ? active.id : incomingComps[0]?.id || null;
          });
        }
        if (d.users !== undefined) {
          const incomingUsers = toArray<User>(d.users);
          if (incomingUsers.length > 0) {
            setData(prev => ({ ...prev, users: incomingUsers }));
          }
        }
        if (cfg.appName) setAppNameState(cfg.appName);
        if (cfg.customLogo !== undefined) setCustomLogoState(cfg.customLogo);
        if (cfg.supervisorPassword) setSupervisorPasswordState(cfg.supervisorPassword);
      };

      setFirebaseConnectionStatus('connecting');
      fetch(`/api/realtime-sync/${encodeURIComponent(roomId)}`)
        .then(r => r.json())
        .then(payload => {
          if (!isMounted) return;
          applyRoomPayload(payload);
          setFirebaseConnectionStatus('connected');
          setIsLoadingFirebase(false);
        })
        .catch(() => {
          if (!isMounted) return;
          setIsLoadingFirebase(false);
        });

      try {
        es = new EventSource(`/api/realtime-sync/${encodeURIComponent(roomId)}/stream`);
        es.onopen = () => {
          if (isMounted) {
            setFirebaseConnectionStatus('connected');
            setIsLoadingFirebase(false);
          }
        };
        es.onmessage = ev => {
          try {
            const parsed = JSON.parse(ev.data);
            applyRoomPayload(parsed);
          } catch {}
        };
        es.onerror = () => {
          if (isMounted) {
            setFirebaseConnectionStatus(navigator.onLine ? 'connecting' : 'offline');
          }
        };
      } catch {}

      return () => {
        isMounted = false;
        if (es) es.close();
      };
    }

    const db = getDb();
    if (!db) {
      if (!initFirebase(firebaseConfigState)) {
        setFirebaseConnectionStatus('disconnected');
        setIsLoadingFirebase(false);
        return;
      }
    }

    const activeDb = getDb();
    if (!activeDb) {
      setIsLoadingFirebase(false);
      return;
    }

    const connectedRef = activeDb.ref('.info/connected');
    const dataRef = activeDb.ref('data');
    const configRef = activeDb.ref('config');

    const loadingTimeout = setTimeout(() => {
      setIsLoadingFirebase(false);
    }, 3500);

    const onConnectedChange = (snap: any) => {
      const isOnline = snap.val() === true;
      setFirebaseConnectionStatus(isOnline ? 'connected' : navigator.onLine ? 'connecting' : 'offline');
      if (isOnline) setIsLoadingFirebase(false);
    };

    connectedRef.on('value', onConnectedChange);

    const handleSnapshotValue = (key: keyof AppDataState, val: any) => {
      const incomingList = toArray<any>(val);
      setData(prev => {
        if (key === 'users' && incomingList.length === 0) {
          return { ...prev, users: INITIAL_USERS };
        }
        if (key === 'competitions') {
          const normalizedComps = incomingList.map(normalizeCompetition);
          setActiveCompetitionIdState(prevId => {
            if (prevId && normalizedComps.some(c => c.id === prevId)) return prevId;
            const active = normalizedComps.find(c => c.isActive);
            return active ? active.id : normalizedComps[0]?.id || null;
          });
          return { ...prev, competitions: normalizedComps };
        }
        return { ...prev, [key]: incomingList };
      });
    };

    const keys: (keyof AppDataState)[] = ['users', 'competitions'];

    const evalRef = activeDb.ref('data/globalEvaluators');
    const onEvaluatorsValue = (snap: any) => {
      if (snap.exists()) {
        const evals = toArray<GlobalEvaluator>(snap.val());
        setGlobalEvaluatorsState(evals);
        safeLocalStorage.setItem('competitionGlobalEvaluators', JSON.stringify(evals));
      }
    };
    evalRef.on('value', onEvaluatorsValue);

    dataRef.once('value', snap => {
      if (snap.exists()) {
        const fullVal = snap.val();
        if (fullVal && typeof fullVal === 'object') {
          if (fullVal.users !== undefined) handleSnapshotValue('users', fullVal.users);
          if (fullVal.competitions !== undefined) handleSnapshotValue('competitions', fullVal.competitions);
          if (fullVal.globalEvaluators) {
            onEvaluatorsValue({ exists: () => true, val: () => fullVal.globalEvaluators });
          }
        }
        setFirebaseConnectionStatus('connected');
      }
      setIsLoadingFirebase(false);
      clearTimeout(loadingTimeout);
    });

    configRef.once('value', snap => {
      if (snap.exists()) {
        const cfg = snap.val();
        if (cfg) {
          if (cfg.appName) setAppNameState(cfg.appName);
          if (cfg.customLogo !== undefined) setCustomLogoState(cfg.customLogo);
          if (cfg.supervisorPassword) setSupervisorPasswordState(cfg.supervisorPassword);
        }
      }
    });

    keys.forEach(key => {
      activeDb.ref(`data/${key}`).on('value', snap => {
        if (snap.exists()) {
          handleSnapshotValue(key, snap.val());
          setIsLoadingFirebase(false);
          setFirebaseConnectionStatus('connected');
        }
      });
    });

    const onConfigValue = (snap: any) => {
      if (snap.exists()) {
        const cfg = snap.val();
        if (cfg.appName) setAppNameState(cfg.appName);
        if (cfg.customLogo !== undefined) setCustomLogoState(cfg.customLogo);
        if (cfg.supervisorPassword) setSupervisorPasswordState(cfg.supervisorPassword);
      }
    };
    configRef.on('value', onConfigValue);

    return () => {
      clearTimeout(loadingTimeout);
      connectedRef.off('value', onConnectedChange);
      keys.forEach(key => activeDb.ref(`data/${key}`).off());
      evalRef.off('value', onEvaluatorsValue);
      configRef.off('value', onConfigValue);
    };
  }, [firebaseConfigState]);

  useEffect(() => {
    try {
      safeLocalStorage.setItem(APP_DATA_KEY, JSON.stringify(data));
      safeLocalStorage.setItem('competitions', JSON.stringify(data.competitions || []));
      if (customLogo) safeLocalStorage.setItem(CUSTOM_LOGO_KEY, customLogo);
      else safeLocalStorage.removeItem(CUSTOM_LOGO_KEY);
      safeLocalStorage.setItem(SUPERVISOR_PASSWORD_KEY, supervisorPassword);
      safeLocalStorage.setItem(APP_NAME_KEY, appName);
    } catch (e) {}
  }, [data, customLogo, supervisorPassword, appName]);

  useEffect(() => {
    if (darkMode) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
    safeLocalStorage.setItem(DARK_MODE_KEY, String(darkMode));
  }, [darkMode]);

  useEffect(() => {
    document.title = appName || DEFAULT_APP_NAME;
    const iconHref = customLogo || DEFAULT_FAVICON_URL;
    const favicons = document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]');
    favicons.forEach(el => {
      (el as HTMLLinkElement).href = iconHref;
    });
    const appleIcons = document.querySelectorAll('link[rel="apple-touch-icon"]');
    appleIcons.forEach(el => {
      (el as HTMLLinkElement).href = customLogo || '/icon-180.png';
    });
  }, [appName, customLogo]);

  const handleLogout = useCallback(() => {
    setCurrentUser(null);
    safeLocalStorage.removeItem(CURRENT_USER_KEY);
    safeLocalStorage.removeItem(SESSION_TIMESTAMP_KEY);
  }, []);

  const initiateLogoutCheck = useCallback(() => {
    handleLogout();
  }, [handleLogout]);

  const handleLogin = (user: User, rememberMe: boolean = true) => {
    if (!user) return;
    setCurrentUser(user);
    if (rememberMe) {
      safeLocalStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
      safeLocalStorage.setItem(SESSION_TIMESTAMP_KEY, Date.now().toString());
    } else {
      safeLocalStorage.removeItem(CURRENT_USER_KEY);
      safeLocalStorage.removeItem(SESSION_TIMESTAMP_KEY);
    }
  };

  const handleImportFullBackup = useCallback(
    (d: FullBackupData) => {
      const normalizedComps = (d.competitions || []).map(normalizeCompetition);
      const usersList = d.users && d.users.length > 0 ? d.users : INITIAL_USERS;
      const evaluatorsList = Array.isArray(d.globalEvaluators) ? d.globalEvaluators : [];

      const db = getDb();
      if (db) {
        const cleanData = sanitizeForFirebase({
          users: usersList,
          competitions: normalizedComps,
          globalEvaluators: evaluatorsList,
        });
        db.ref('data').set(cleanData);
        db.ref('config').set(
          sanitizeForFirebase({
            appName: d.appName || DEFAULT_APP_NAME,
            customLogo: d.customLogo || null,
            supervisorPassword: d.supervisorPassword || '123',
          })
        );
      }

      setData({
        users: usersList,
        competitions: normalizedComps,
      });
      if (evaluatorsList.length > 0) {
        updateGlobalEvaluators(evaluatorsList);
      }
      if (d.appName) setAppNameState(d.appName);
      if (d.customLogo !== undefined) setCustomLogoState(d.customLogo);
      if (d.supervisorPassword) setSupervisorPasswordState(d.supervisorPassword);
    },
    [updateGlobalEvaluators]
  );

  const setAppName = useCallback(
    (n: string) => {
      setAppNameState(n);
      writeData('config/appName', n);
    },
    [writeData]
  );

  const setCustomLogo = useCallback(
    (l: string | null) => {
      setCustomLogoState(l);
      writeData('config/customLogo', l);
    },
    [writeData]
  );

  const setSupervisorPassword = useCallback(
    (p: string) => {
      setSupervisorPasswordState(p);
      if (safeLocalStorage.getItem(REMEMBER_ME_PREFERENCE_KEY) !== 'false' && safeLocalStorage.getItem(REMEMBERED_LOGIN_PASSWORD_KEY)) {
        safeLocalStorage.setItem(REMEMBERED_LOGIN_PASSWORD_KEY, p);
      }
      writeData('config/supervisorPassword', p);
    },
    [writeData]
  );

  const toggleDarkMode = useCallback(() => setDarkMode(prev => !prev), []);

  const disconnectFirebaseDatabase = useCallback(() => {
    disconnectFirebase();
    setFirebaseConfigState(null);
    try {
      safeLocalStorage.removeItem(SYNC_QUEUE_KEY);
    } catch (e) {}
    setSyncQueue([]);
    setFirebaseConnectionStatus('disconnected');
    showToast('تم إيقاف المزامنة السحابية. التطبيق يعمل الآن محلياً ومستقلاً.', 'success');
  }, [showToast]);

  const deleteAllData = useCallback(async () => {
    const supervisor = (data.users || []).find(u => u.role === UserRole.SUPERVISOR) || INITIAL_USERS[0];
    setData({
      users: [supervisor],
      competitions: [],
    });
    writeData('data/users', [supervisor]);
    writeData('data/competitions', null);
    writeData('config', {
      appName: DEFAULT_APP_NAME,
      supervisorPassword: '123',
      customLogo: null,
    });
    showToast('تم مسح جميع بيانات المسابقات وإعادة ضبط المصنع بنجاح', 'success');
  }, [data.users, writeData, showToast]);

  const updateCompetitions = useCallback(
    (newCompetitions: Competition[]) => {
      const normalized = (newCompetitions || []).map(normalizeCompetition);
      writeData('data/competitions', normalized);
    },
    [writeData]
  );

  const contextValue = useMemo(
    () => ({
      users: data.users || [],
      competitions: (data.competitions || []).map(normalizeCompetition),
      updateCompetitions,
      globalEvaluators,
      updateGlobalEvaluators,
      activeCompetitionId,
      setActiveCompetitionId,
      isSyncing: isLoadingFirebase,
      theme: (darkMode ? 'dark' : 'light') as 'light' | 'dark',
      toggleTheme: toggleDarkMode,
      deleteAllData,
      customLogo,
      setCustomLogo,
      importFullBackup: handleImportFullBackup,
      supervisorPassword,
      setSupervisorPassword,
      logout: handleLogout,
      initiateLogoutCheck,
      isLoading,
      isLoadingFirebase,
      appName,
      setAppName,
      darkMode,
      toggleDarkMode,
      firebaseConnectionStatus,
      firebaseConfig: firebaseConfigState,
      setFirebaseConfig: setFirebaseConfigState,
      isDistributable,
      isPublishedConnected,
      currentUser,
      showToast,
      disconnectFirebaseDatabase,
    }),
    [
      data,
      globalEvaluators,
      updateGlobalEvaluators,
      activeCompetitionId,
      setActiveCompetitionId,
      updateCompetitions,
      deleteAllData,
      customLogo,
      setCustomLogo,
      handleImportFullBackup,
      supervisorPassword,
      setSupervisorPassword,
      handleLogout,
      initiateLogoutCheck,
      isLoading,
      isLoadingFirebase,
      appName,
      setAppName,
      darkMode,
      toggleDarkMode,
      firebaseConnectionStatus,
      firebaseConfigState,
      isDistributable,
      isPublishedConnected,
      currentUser,
      showToast,
      disconnectFirebaseDatabase,
    ]
  );

  return (
    <AppContext.Provider value={contextValue}>
      <div
        className={`min-h-screen min-h-[100dvh] w-full max-w-[100vw] overflow-x-hidden flex-1 transition-colors duration-300 flex flex-col ${
          darkMode ? 'bg-[#070E1C] text-white' : 'bg-[#FAF8F5] text-slate-900'
        }`}
      >
        {/* حاوية رسائل التنبيه المتوافقة مع شاشات الهواتف */}
        <div className="fixed top-3 sm:top-6 left-1/2 -translate-x-1/2 z-[10001] flex flex-col gap-2.5 w-[92vw] max-w-sm px-2 pointer-events-none">
          {toasts.map(toast => (
            <div
              key={toast.id}
              className={`pointer-events-auto p-3 sm:p-4 rounded-2xl shadow-2xl text-center text-xs sm:text-sm font-extrabold text-white animate-fade-in border-b-4 ${
                toast.type === 'success'
                  ? 'bg-green-600 border-green-800'
                  : toast.type === 'error'
                  ? 'bg-red-600 border-red-800'
                  : 'bg-blue-600 border-blue-800'
              }`}
            >
              {toast.message}
            </div>
          ))}
        </div>

        {(() => {
          const isEvaluatorUser = Boolean(
            currentUser &&
              (currentUser.role === UserRole.COMPETITION_EVALUATOR ||
                (currentUser.role as string) === 'evaluator' ||
                Boolean((currentUser as any).competitionId))
          );

          return (
            <>
              {!currentUser ? (
                <LoginScreen onLogin={handleLogin} />
              ) : isEvaluatorUser ? (
                <EvaluatorDashboard evaluatorUser={currentUser} onLogout={initiateLogoutCheck} />
              ) : (
                <>
                  <Header />
                  <main className="px-2 sm:px-6 lg:px-8 py-3 sm:py-6 flex-1 pb-12 w-full max-w-full overflow-x-hidden">
                    <SupervisorDashboard />
                  </main>
                </>
              )}
            </>
          );
        })()}
        {showMobileInstallModal && <MobileInstallModal onClose={() => setShowMobileInstallModal(false)} />}
        {showChangePasswordModal && (
          <ChangePasswordModal
            onClose={() => setShowChangePasswordModal(false)}
            supervisorPassword={supervisorPassword}
            setSupervisorPassword={p => {
              setSupervisorPasswordState(p);
              writeData('config/supervisorPassword', p);
            }}
          />
        )}
      </div>
    </AppContext.Provider>
  );
};

export default App;
