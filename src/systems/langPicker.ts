/**
 * LANGUAGE dropdown on the MODES screen: a button showing the current flag + name that opens a
 * listbox of every language in LANGS (flag first, name in its own language). Built by hand, not
 * a native <select>, because a <select> can't show the flag pictures.
 *
 * Accessibility: button with aria-haspopup="listbox" / aria-expanded; the list is role="listbox"
 * with role="option" rows (aria-selected) and aria-activedescendant for the keyboard highlight.
 * Keys: Enter / Space / ArrowDown / ArrowUp open; arrows, Home / End move; Enter / Space pick;
 * Escape closes (back on the button); Tab closes. Taps / clicks outside close it, and that tap is
 * swallowed so it never also presses a mode button or reaches the game.
 * Keys and taps the dropdown handles never reach the game's controls (Input listens on window).
 */
import { LANGS, isLang, lang, onLang, type Lang } from '../i18n';

export interface LangPicker {
  close(): void;
  isOpen(): boolean;
}

export function mountLangPicker(opts: {
  /** Called with the picked language (the caller runs setLang + a UI sound). */
  onPick: (l: Lang) => void;
  /** Called when the list opens (UI sound). */
  onOpen?: () => void;
  /** True while taps must be ignored (the MODES menu's opening ghost tap). */
  ignoreTap?: () => boolean;
}): LangPicker | null {
  const root = document.getElementById('lang-dd');
  if (!root) return null;
  root.textContent = '';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'lang-btn';
  btn.className = 'lang-btn';
  btn.draggable = false;
  btn.setAttribute('aria-haspopup', 'listbox');
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-controls', 'lang-list');
  btn.setAttribute('aria-labelledby', 'lang-label lang-btn');
  const btnFlag = document.createElement('span');
  btnFlag.className = 'lang-flag';
  btnFlag.setAttribute('aria-hidden', 'true');
  const btnName = document.createElement('span');
  btnName.className = 'lang-name';
  const caret = document.createElement('span');
  caret.className = 'lang-caret';
  caret.setAttribute('aria-hidden', 'true');
  btn.append(btnFlag, btnName, caret);

  const list = document.createElement('ul');
  list.id = 'lang-list';
  list.className = 'lang-list';
  list.setAttribute('role', 'listbox');
  list.tabIndex = -1;
  list.setAttribute('aria-label', 'Language');
  list.hidden = true;

  const opts2: HTMLLIElement[] = LANGS.map((l) => {
    const li = document.createElement('li');
    li.id = `lang-opt-${l.id}`;
    li.className = 'lang-opt';
    li.dataset.lang = l.id;
    li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', 'false');
    li.lang = l.html;
    const f = document.createElement('span');
    f.className = 'lang-flag';
    f.setAttribute('aria-hidden', 'true');
    f.innerHTML = l.flag;
    const n = document.createElement('span');
    n.className = 'lang-name';
    n.textContent = l.name;
    li.append(f, n);
    list.append(li);
    return li;
  });
  root.append(btn, list);

  let open = false;
  let active = 0;
  /** After an outside tap closes the list, swallow that tap's pointerup / click (ms deadline). */
  let swallowUntil = 0;
  /** Just after the keyboard closed the list onto the button: ignore a non-pointer click there. */
  let keyQuietUntil = 0;

  const sync = (): void => {
    const cur = lang();
    const info = LANGS.find((l) => l.id === cur) ?? LANGS[0];
    if (btnFlag.dataset.lang !== info.id) {
      btnFlag.innerHTML = info.flag;
      btnFlag.dataset.lang = info.id;
      btnName.textContent = info.name;
      btnName.lang = info.html;
    }
    opts2.forEach((li) => li.setAttribute('aria-selected', li.dataset.lang === cur ? 'true' : 'false'));
  };

  const setActive = (i: number): void => {
    active = (i + opts2.length) % opts2.length;
    opts2.forEach((li, k) => li.classList.toggle('active', k === active));
    const el = opts2[active];
    list.setAttribute('aria-activedescendant', el.id);
    // Keep the highlighted row in view without scrolling the page / MODES card.
    if (el.offsetTop < list.scrollTop) list.scrollTop = el.offsetTop;
    else if (el.offsetTop + el.offsetHeight > list.scrollTop + list.clientHeight)
      list.scrollTop = el.offsetTop + el.offsetHeight - list.clientHeight;
  };

  const openList = (): void => {
    if (open) return;
    open = true;
    sync();
    list.hidden = false;
    root.classList.add('open');
    btn.setAttribute('aria-expanded', 'true');
    setActive(Math.max(0, LANGS.findIndex((l) => l.id === lang())));
    list.focus({ preventScroll: true });
    // On a short screen, scroll the MODES card just enough to show the whole list.
    const r = list.getBoundingClientRect();
    if (r.bottom > window.innerHeight || r.top < 0) list.scrollIntoView({ block: 'nearest' });
    opts.onOpen?.();
  };

  const closeList = (refocus: boolean): void => {
    if (!open) return;
    open = false;
    list.hidden = true;
    root.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
    list.removeAttribute('aria-activedescendant');
    if (refocus) {
      btn.focus({ preventScroll: true });
      // The key that closed the list (Space / Enter) must not also "click" the button on keyup.
      keyQuietUntil = performance.now() + 400;
    }
  };

  const pick = (i: number): void => {
    const id = opts2[i]?.dataset.lang;
    closeList(true);
    if (isLang(id)) opts.onPick(id);
    sync();
  };

  // —— Pointer (touch + mouse). pointerup acts (reliable on iOS); the follow-up click is eaten. ——
  const tapOn = (el: HTMLElement, fn: () => void): void => {
    let armed = false;
    let fromPointer = false;
    el.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      if (e.button !== undefined && e.button !== 0) return;
      armed = true;
    });
    el.addEventListener('pointerup', (e) => {
      e.stopPropagation();
      if (!armed) return;
      armed = false;
      fromPointer = true;
      if (opts.ignoreTap?.()) return;
      fn();
    });
    el.addEventListener('pointercancel', () => {
      armed = false;
    });
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (fromPointer) {
        fromPointer = false;
        return;
      }
      // A click with no pointer press first: screen reader activation.
      if (el === btn && performance.now() < keyQuietUntil) return;
      fn();
    });
  };
  tapOn(btn, () => (open ? closeList(true) : openList()));
  opts2.forEach((li, i) => {
    tapOn(li, () => pick(i));
    li.addEventListener('pointermove', (e) => {
      if (open && e.pointerType === 'mouse' && active !== i) setActive(i);
    });
  });
  // Touches inside the dropdown are UI, not game input.
  root.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });

  // Outside tap / click closes the list; that same tap does nothing else.
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (!open || root.contains(e.target as Node)) return;
      closeList(false);
      swallowUntil = performance.now() + 700;
      e.stopPropagation();
      e.preventDefault();
    },
    true,
  );
  for (const ev of ['pointerup', 'click'] as const) {
    document.addEventListener(
      ev,
      (e) => {
        if (performance.now() > swallowUntil || root.contains(e.target as Node)) return;
        e.stopPropagation();
        e.preventDefault();
        if (ev === 'click') swallowUntil = 0;
      },
      true,
    );
  }
  // Focus leaving the dropdown (Tab, or the menu closing) closes the list.
  root.addEventListener('focusout', (e) => {
    const to = e.relatedTarget as Node | null;
    if (open && to && !root.contains(to)) closeList(false);
  });

  // —— Keyboard ——
  btn.addEventListener('keydown', (e) => {
    if (open) return; // the list has focus while open
    const k = e.key;
    if (k === 'Enter' || k === ' ' || k === 'Spacebar' || k === 'ArrowDown' || k === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      openList();
      if (k === 'ArrowUp') setActive(active - 1);
      else if (k === 'ArrowDown' && !e.altKey) setActive(active);
    }
    // Other keys (Tab, Escape to close MODES, M to mute…) behave as before.
  });
  list.addEventListener('keydown', (e) => {
    if (!open) return;
    const k = e.key;
    if (k === 'Tab') {
      closeList(false);
      return; // let focus move on
    }
    // While the list is open, no key reaches the game.
    e.stopPropagation();
    if (k === 'ArrowDown') setActive(active + 1);
    else if (k === 'ArrowUp') setActive(active - 1);
    else if (k === 'Home' || k === 'PageUp') setActive(0);
    else if (k === 'End' || k === 'PageDown') setActive(opts2.length - 1);
    else if (k === 'Enter' || k === ' ' || k === 'Spacebar') pick(active);
    else if (k === 'Escape') closeList(true);
    else if (k.length === 1) {
      // Type-ahead: first language whose name starts with the letter (after the current one).
      const ch = k.toLocaleLowerCase();
      for (let s = 1; s <= opts2.length; s++) {
        const i = (active + s) % opts2.length;
        if ((LANGS[i].name[0] ?? '').toLocaleLowerCase() === ch) {
          setActive(i);
          break;
        }
      }
    } else return;
    e.preventDefault();
  });

  sync();
  onLang(sync);
  return {
    close: () => closeList(false),
    isOpen: () => open,
  };
}
