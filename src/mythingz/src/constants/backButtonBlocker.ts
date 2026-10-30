import { useEffect } from 'react';
import { useBlocker } from 'react-router-dom';

export function useBackButtonBlocker(
  shouldBlock: boolean,
  beforeReset: () => Promise<void>,
) {
  const blocker = useBlocker(shouldBlock);

  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    void beforeReset()
      .then(() => blocker.reset())
      .catch(() => {
        window.alert('Could not save note\n\nPlease try again.');
        blocker.reset();
      });
  }, [blocker.state, blocker.reset, beforeReset]);

  return blocker;
}
