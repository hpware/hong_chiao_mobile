import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query';
import { createContext, use, useEffect, useRef, useState, type ReactNode } from 'react';

import { logoutRemote, renewTimer } from '@/lib/api/auth';
import { clearPortalPassword } from '@/lib/credentials';
import { clearAllCookies, SchoolDownError, setApiUrl, SessionExpiredError } from '@/lib/http';
import { reportUnreachable } from '@/lib/outage';
import { clearProfilePhoto } from '@/lib/old/profile-photo';
import {
  clearLegacyAccount,
  clearLegacySession,
  LegacyDownError,
  restoreLegacyAccount,
} from '@/lib/old/client';
import { clearScheduleWidget } from '@/widgets/sync-schedule-widget';
import { getItem, removeItem, SCHOOL, setItem, StorageKeys } from '@/lib/storage';

type Status = 'booting' | 'signedOut' | 'signedIn';

type SessionContextValue = {
  status: Status;
  apiUrl: string;
  schoolName: string;
  studentId: string;
  signedIn: (studentId: string) => void;
  signOut: (options?: { expired?: boolean }) => Promise<void>;
  /** Why the user was logged out (shown on the login screen); null after a normal sign-out. */
  logoutNotice: string | null;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('booting');
  const apiUrl: string = SCHOOL.apiUrl;
  const schoolName: string = SCHOOL.name;
  const [studentId, setStudentId] = useState('');
  const [logoutNotice, setLogoutNotice] = useState<string | null>(null);
  // Query/mutation caches are created once, so they reach the latest
  // session state through this ref.
  const expire = useRef(() => {});
  // Several requests usually fail together; show one alert.
  const expiring = useRef(false);
  const statusRef = useRef(status);
  statusRef.current = status;
  useEffect(() => {
    expire.current = () => {
      if (status !== 'signedIn' || expiring.current) return;
      expiring.current = true;
      // No alert: the login screen explains it and has the password filled in (one tap back in).
      setLogoutNotice('你已被登出，可能是閒置太久，或在其他地方（例如電腦）登入或登出了校務系統。');
      void signOut({ expired: true });
    };
  });


  const [queryClient] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({
          onError: (error) => {
            if (error instanceof SessionExpiredError) expire.current();
          },
        }),
        mutationCache: new MutationCache({
          onError: (error) => {
            if (error instanceof SessionExpiredError) expire.current();
          },
        }),
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            retry: (count, error) =>
              !(error instanceof SessionExpiredError) &&
              !(error instanceof LegacyDownError) &&
              !(error instanceof SchoolDownError) &&
              count < 2,
          },
        },
      }),
  );

  useEffect(() => {
    (async () => {
      setApiUrl(SCHOOL.apiUrl);
      const id = (await getItem(StorageKeys.studentId)) ?? '';
      const wasSignedIn = (await getItem(StorageKeys.wasSignedIn)) === '1';
      setStudentId(id);
      if (id) await restoreLegacyAccount(id);
      // The native cookie store may still hold a live portal session. Don't sit on the splash
      // screen if the portal doesn't answer: a returning student gets into the app (siw data may
      // still work) with an alert explaining the outage; sw sign-in is checked again on use.
      try {
        await Promise.race([
          renewTimer(),
          new Promise((_, reject) => setTimeout(() => reject(new SchoolDownError('timeout')), 8000)),
        ]);
        void setItem(StorageKeys.wasSignedIn, '1');
        setStatus('signedIn');
      } catch (e) {
        const unreachable = !(e instanceof SessionExpiredError);
        setStatus(unreachable && id && wasSignedIn ? 'signedIn' : 'signedOut');
        // A timeout hasn't been explained yet (a failed request already reported itself).
        if (unreachable && (!(e instanceof SchoolDownError) || e.message === 'timeout')) void reportUnreachable('sw');
      }
    })();
  }, []);

  function signedIn(id: string) {
    expiring.current = false;
    setLogoutNotice(null);
    void setItem(StorageKeys.studentId, id);
    void setItem(StorageKeys.wasSignedIn, '1');
    setStudentId(id);
    queryClient.clear();
    setStatus('signedIn');
  }

  async function signOut(options: { expired?: boolean } = {}) {
    // Best effort: still sign out locally when the school can't be reached.
    if (!options.expired) await Promise.race([logoutRemote().catch(() => {}), new Promise((r) => setTimeout(r, 5000))]);
    // Expiry only ends the portal session; keep the saved siw password for the next login.
    if (!options.expired) {
      clearLegacyAccount();
      clearProfilePhoto();
      void clearPortalPassword();
      void clearScheduleWidget();
      setLogoutNotice(null);
    } else {
      // Keep the saved siw password, but drop the live siw session: whoever signs in next
      // (maybe another student) must get a fresh one.
      clearLegacySession();
    }
    // Drop both sessions' cookies, or siw keeps serving the previous student's data.
    await clearAllCookies();
    await removeItem(StorageKeys.userName);
    await removeItem(StorageKeys.wasSignedIn);
    queryClient.clear();
    setStatus('signedOut');
  }

  return (
    <SessionContext
      value={{ status, apiUrl, schoolName, studentId, signedIn, signOut, logoutNotice }}>
      <QueryClientProvider client={queryClient}>
        {status === 'signedIn' ? <SessionKeepAlive /> : null}
        {children}
      </QueryClientProvider>
    </SessionContext>
  );
}

/** The web sidebar pings ReUrlContent every 10 minutes to keep the portal session alive. */
function SessionKeepAlive() {
  useQuery({
    queryKey: ['session', 'renew'],
    queryFn: renewTimer,
    refetchInterval: 10 * 60 * 1000,
    staleTime: 10 * 60 * 1000,
    retryDelay: 3000,
  });
  return null;
}

export function useSession() {
  const ctx = use(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}
