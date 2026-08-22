import { startDispatcher } from './services/dispatcher.js';

console.log('[WORKER] Starting backend email dispatcher...');
startDispatcher(2000);
