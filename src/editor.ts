import './editor.css';

// Called from Python when Anki Markdown note is loaded
(window as any).ankiMdActivate = function() {
    console.log('[anki-md] Activated - Anki Markdown note loaded');
};

// Called from Python when switching to different note type
(window as any).ankiMdDeactivate = function() {
    console.log('[anki-md] Deactivated - switched to other note type');
};

console.log('[anki-md] Editor script loaded');
