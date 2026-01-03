import './editor.css';

(window as any).ankiMdActivate = function() {
    document.body.classList.add('anki-md-active');

    // Make all .rich-text-input elements inert
    document.querySelectorAll('.rich-text-input').forEach((el) => {
        // (el as HTMLElement).inert = true;
        console.log('Making rich-text-input', el);
    });
};

(window as any).ankiMdDeactivate = function() {
    document.body.classList.remove('anki-md-active');
    
    // Remove inert from all .rich-text-input elements
    document.querySelectorAll('.rich-text-input').forEach((_el) => {
        // (el as HTMLElement).inert = false;
    });
};
