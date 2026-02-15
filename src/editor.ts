// Editor integration for Anki Markdown note types.
// Forces markdown-only editing and mounts a shared live preview panel.
import "./editor.css";
import "./markdown-rendered.css";
import {
  MarkdownRenderer,
  readConfig,
} from "./markdown";

declare function require(name: string): any;
declare const globalThis: any;

interface Store<T> {
  subscribe(callback: (value: T) => void): () => void;
}

interface EditingAreaAPI {
  content: Store<string>;
}

interface EditorFieldAPI {
  element: Promise<HTMLElement>;
  editingArea: EditingAreaAPI;
}

interface NoteEditorAPI {
  fields: EditorFieldAPI[];
  focusedField: Store<EditorFieldAPI | null>;
}

const { loaded } = require("anki/ui") as { loaded: Promise<void> };
const { instances } = require("anki/NoteEditor") as { instances: NoteEditorAPI[] };
const active = () => document.body.classList.contains("anki-md-active");

// Editor settings to force-disable for markdown notes
const settings = ["setCloseHTMLTags", "setShrinkImages", "setMathjaxEnabled"];

// Get boolean array matching field count
const fields = async (val: boolean) =>
  ((await instances[0]?.fields)?.map(() => val) ?? []);

const COLLAPSED_KEY = "anki-md-editor-preview-collapsed-v2";

class LivePreview {
  private readonly panel: HTMLElement;
  private readonly toggle: HTMLElement;
  private readonly badge: HTMLElement;
  private readonly iconButton: HTMLButtonElement;
  private readonly meta: HTMLElement;
  private readonly frame: HTMLElement;
  private readonly content: HTMLElement;
  private readonly renderer: MarkdownRenderer;

  private focusedIndex = 0;
  private values: string[] = [];
  private unsubs: Array<() => void> = [];
  private renderToken = 0;
  private mounted = false;
  private visible = false;
  private collapsed = false;
  private pendingRender = false;

  constructor() {
    this.panel = document.createElement("section");
    this.panel.className = "anki-md-preview field-container";
    this.panel.hidden = true;
    this.panel.innerHTML = `
      <div class="anki-md-preview-header label-container">
        <span class="anki-md-preview-collapse collapse-label" tabindex="-1" role="button" aria-expanded="true" title="Collapse preview">
          <div class="anki-md-preview-badge collapse-badge" aria-hidden="true">
            <button type="button" class="anki-md-preview-icon badge" tabindex="-1">
              <span class="anki-md-preview-icon-wrap">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                  <path d="M7.41,8.58L12,13.17L16.59,8.58L18,10L12,16L6,10L7.41,8.58Z"></path>
                </svg>
              </span>
            </button>
          </div>
          <span class="anki-md-preview-title label-name">Markdown Preview</span>
        </span>
        <span class="anki-md-preview-state field-state justify-content-end">
          <span class="anki-md-preview-meta">Preview: Front</span>
        </span>
      </div>
      <div class="anki-md-preview-frame editor-field">
        <div class="anki-md-preview-body">
          <div class="anki-md-preview-content anki-md-rendered">
            <div class="front"></div>
          </div>
        </div>
      </div>
    `;

    this.toggle = this.panel.querySelector(".anki-md-preview-collapse") as HTMLElement;
    this.badge = this.panel.querySelector(".anki-md-preview-badge") as HTMLElement;
    this.iconButton = this.panel.querySelector(".anki-md-preview-icon") as HTMLButtonElement;
    this.meta = this.panel.querySelector(".anki-md-preview-meta") as HTMLElement;
    this.frame = this.panel.querySelector(".anki-md-preview-frame") as HTMLElement;
    this.content = this.panel.querySelector(".front") as HTMLElement;

    this.renderer = new MarkdownRenderer({
      config: readConfig(),
      assetBase: this.addonBase(),
    });
    this.renderer.attachCodeBlockHandlers(this.panel);

    this.collapsed = this.readCollapsed();
    this.syncCollapsedState();

    this.toggle.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.handleToggle();
    });

    this.toggle.addEventListener("keydown", (event: KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      event.stopPropagation();
      this.handleToggle();
    });

    // Keep icon click from stealing focus.
    this.iconButton.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
  }

  async show(noteEditor: NoteEditorAPI): Promise<void> {
    await this.mountBelowFields(noteEditor);
    this.bindStores(noteEditor);
    this.panel.hidden = false;
    this.visible = true;
    this.renderFocused();
  }

  hide(): void {
    this.visible = false;
    this.panel.hidden = true;
    this.unbindStores();
  }

  private handleToggle(): void {
    this.collapsed = !this.collapsed;
    this.syncCollapsedState();

    if (!this.collapsed && this.pendingRender) {
      this.renderFocused();
    }
  }

  private unbindStores(): void {
    for (const unsub of this.unsubs) unsub();
    this.unsubs = [];
  }

  private bindStores(noteEditor: NoteEditorAPI): void {
    this.unbindStores();

    const fields = noteEditor.fields ?? [];
    this.values = Array(fields.length).fill("");
    this.focusedIndex = 0;

    fields.forEach((field, index) => {
      this.unsubs.push(
        field.editingArea.content.subscribe((value) => {
          this.values[index] = value;
          if (index === this.focusedIndex) {
            this.renderFocused();
          }
        }),
      );
    });

    this.unsubs.push(
      noteEditor.focusedField.subscribe((field) => {
        if (!field) return;
        const index = fields.indexOf(field);
        if (index === -1) return;
        this.focusedIndex = index;
        this.renderFocused();
      }),
    );
  }

  private async mountBelowFields(noteEditor: NoteEditorAPI): Promise<void> {
    const fieldElements = await Promise.all(
      (noteEditor.fields ?? []).map((field) => field.element),
    );

    const lastEditorField = fieldElements[fieldElements.length - 1] as HTMLElement | undefined;
    if (!lastEditorField) return;

    const sourceFieldContainer = lastEditorField.closest(".field-container") as
      | HTMLElement
      | null;
    const anchor = sourceFieldContainer ?? lastEditorField;
    const parent = anchor.parentElement;
    if (!parent) return;

    if (!this.mounted || this.panel.parentElement !== parent) {
      parent.insertBefore(this.panel, anchor.nextSibling);
      this.mounted = true;
      return;
    }

    if (this.panel.previousElementSibling !== anchor) {
      parent.insertBefore(this.panel, anchor.nextSibling);
    }
  }

  private async renderFocused(): Promise<void> {
    if (!this.visible) return;

    const maxIndex = this.values.length - 1;
    if (maxIndex < 0) {
      this.meta.textContent = "Preview";
      this.content.innerHTML = "";
      return;
    }

    const index = Math.max(0, Math.min(this.focusedIndex, maxIndex));
    this.meta.textContent = `Preview: ${this.fieldName(index)}`;

    if (this.collapsed) {
      this.pendingRender = true;
      return;
    }

    this.pendingRender = false;
    const token = ++this.renderToken;
    const html = await this.renderer.render(this.values[index] ?? "");

    if (token !== this.renderToken || !this.visible || this.collapsed) return;
    this.content.innerHTML = html;
  }

  private fieldName(index: number): string {
    if (index === 0) return "Front";
    if (index === 1) return "Back";
    return `Field ${index + 1}`;
  }

  private syncCollapsedState(): void {
    this.panel.classList.toggle("collapsed", this.collapsed);
    this.frame.hidden = this.collapsed;
    this.badge.classList.toggle("collapsed", this.collapsed);
    this.toggle.setAttribute("aria-expanded", String(!this.collapsed));
    this.toggle.title = this.collapsed ? "Expand preview" : "Collapse preview";

    try {
      localStorage.setItem(COLLAPSED_KEY, this.collapsed ? "1" : "0");
    } catch {
      // ignore storage failures
    }
  }

  private readCollapsed(): boolean {
    try {
      return localStorage.getItem(COLLAPSED_KEY) === "1";
    } catch {
      return false;
    }
  }

  private addonBase(): string {
    const script = Array.from(document.querySelectorAll("script[src]")).find((el) => {
      const src = (el as HTMLScriptElement).src;
      return /\/web\/editor\.js(?:\?.*)?$/.test(src);
    }) as HTMLScriptElement | undefined;

    if (!script?.src) return "./";
    return script.src.replace(/\/web\/editor\.js(?:\?.*)?$/, "/");
  }

}

let preview: LivePreview | null = null;

function currentEditor(): NoteEditorAPI | null {
  return instances[0] ?? null;
}

globalThis.ankiMdActivate = async () => {
  await loaded;

  document.body.classList.add("anki-md-active");
  for (const fn of settings) globalThis[fn](false);
  globalThis.setPlainTexts(await fields(true));

  const editor = currentEditor();
  if (!editor) return;

  if (!preview) preview = new LivePreview();
  await preview.show(editor);
};

globalThis.ankiMdDeactivate = async () => {
  await loaded;

  document.body.classList.remove("anki-md-active");
  for (const fn of settings) globalThis[fn](true);
  globalThis.setPlainTexts(await fields(false));

  preview?.hide();
};

// Wrap editor globals to force correct values when active
loaded.then(() => {
  for (const fn of settings) {
    const orig = globalThis[fn];
    globalThis[fn] = (val: boolean) => orig(active() ? false : val);
  }

  const orig = globalThis.setPlainTexts;
  globalThis.setPlainTexts = (vals: boolean[]) =>
    orig(active() ? vals.map(() => true) : vals);
});
