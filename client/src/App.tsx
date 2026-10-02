import { useStore } from './state/store';
import { JoinScreen } from './ui/JoinScreen';
import { Office } from './ui/Office';

export function App() {
  const phase = useStore((s) => s.phase);
  return phase === 'office' ? <Office /> : <JoinScreen />;
}
