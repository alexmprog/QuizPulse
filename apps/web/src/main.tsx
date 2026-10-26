import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/studio.css';
import './styles/host.css';
import './styles/play.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');
createRoot(root).render(
    <StrictMode>
        <App />
    </StrictMode>,
);
