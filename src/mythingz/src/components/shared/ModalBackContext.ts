import { createContext, useContext, useEffect, useRef } from 'react';

type ModalBackContextValue = {
  registerModal: (token: symbol, onBack: () => void) => () => void;
};

export const ModalBackContext = createContext<ModalBackContextValue | null>(null);

export function useModalBack(enabled: boolean, onBack: () => void) {
  const context = useContext(ModalBackContext);
  if (!context) throw new Error('useModalBack must be used within ModalBackProvider.');
  const onBackRef = useRef(onBack);
  const token = useRef(Symbol('modal'));

  useEffect(() => {
    onBackRef.current = onBack;
  }, [onBack]);

  useEffect(() => {
    if (!enabled) return undefined;
    return context.registerModal(token.current, () => onBackRef.current());
  }, [context, enabled]);
}
