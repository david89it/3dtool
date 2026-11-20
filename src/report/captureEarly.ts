// Imported first in main.tsx so the console memory starts before the rest of the app loads.
import { installConsoleCapture } from './consoleBuffer';

installConsoleCapture();
