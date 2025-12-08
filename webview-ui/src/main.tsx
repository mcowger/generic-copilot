import { createRoot } from 'react-dom/client';
import App from './App';
import ConsoleApp from './components/console/ConsoleApp';

const rootEl = document.getElementById('root');
const consoleRoot = document.getElementById('console-root');

if (rootEl) {
    const root = createRoot(rootEl);
    root.render(<App />);
} else if (consoleRoot) {
    const root = createRoot(consoleRoot);
    root.render(<ConsoleApp />);
}
