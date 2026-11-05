import { createContext, useContext } from 'react';

type DetailKind = 'event' | 'list' | 'note' | 'task';
type RecordDetailsModalContextValue = {
  openRecordDetails: (kind: DetailKind, id: number) => void;
};

export const RecordDetailsModalContext = createContext<RecordDetailsModalContextValue | null>(null);

export function useRecordDetailsModal() {
  const context = useContext(RecordDetailsModalContext);
  if (!context) {
    throw new Error('useRecordDetailsModal must be used within RecordDetailsModalProvider.');
  }
  return context;
}
