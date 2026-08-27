import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useLocation } from 'react-router-dom';
import { FeedbackModal } from './FeedbackModal';
import type {
  FeedbackContextDetails,
  FeedbackTechnicalContext,
} from './types';

type FeedbackContextValue = {
  openFeedback: (details?: FeedbackContextDetails) => void;
};

const Context = createContext<FeedbackContextValue | null>(null);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [details, setDetails] = useState<FeedbackContextDetails | null>(null);

  const openFeedback = useCallback((next?: FeedbackContextDetails) => {
    setDetails(next ?? {});
  }, []);
  const value = useMemo(() => ({ openFeedback }), [openFeedback]);
  const technicalContext: FeedbackTechnicalContext | null = details
    ? {
        appVersion: __APP_VERSION__,
        route: feedbackRoute(location.pathname),
        userAgent: navigator.userAgent,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
        },
        ...details,
      }
    : null;

  return (
    <Context.Provider value={value}>
      {children}
      {technicalContext ? (
        <FeedbackModal
          context={technicalContext}
          onClose={() => setDetails(null)}
        />
      ) : null}
    </Context.Provider>
  );
}

export function useFeedback(): FeedbackContextValue {
  const value = useContext(Context);
  if (!value) {
    throw new Error('useFeedback must be used within FeedbackProvider.');
  }
  return value;
}

export function feedbackRoute(pathname: string): string {
  return pathname.replace(
    /^\/(e|host)\/[^/]+/,
    (_match, area: string) => `/${area}/:joinCode`,
  );
}
