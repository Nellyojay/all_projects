import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useBlocker } from 'react-router-dom';
import { ModalBackContext } from './ModalBackContext';

export function ModalBackProvider({ children }: { children: ReactNode }) {
  const modalStack = useRef<Array<{ token: symbol; onBack: () => void }>>([]);
  const registerModal = useCallback((token: symbol, onBack: () => void) => {
    modalStack.current = modalStack.current.filter((modal) => modal.token !== token);
    modalStack.current.push({ token, onBack });
    return () => {
      modalStack.current = modalStack.current.filter((modal) => modal.token !== token);
    };
  }, []);
  const contextValue = useMemo(() => ({ registerModal }), [registerModal]);
  const shouldBlock = useCallback(
    ({ historyAction }: { historyAction: string }) =>
      historyAction === 'POP' && modalStack.current.length > 0,
    [],
  );
  const blocker = useBlocker(shouldBlock);

  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    const topModal = modalStack.current[modalStack.current.length - 1];
    topModal?.onBack();
    blocker.reset();
  }, [blocker]);

  return (
    <ModalBackContext.Provider value={contextValue}>
      {children}
    </ModalBackContext.Provider>
  );
}
