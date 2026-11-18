// Screen navigation. The shell registers itself here so any screen can push another or go back
// without importing the shell (avoids circular imports).

import { clearToast } from './dom.js';

let impl = null;

export const nav = {
  /** @param {{push:Function, back:Function, refreshSide:Function}} shell */
  attach(shell) { impl = shell; },
  /** Open a screen on top of the current one. */
  push(screen) { clearToast(); impl.push(screen); },
  /** Return to the previous screen. */
  back() { clearToast(); impl.back(); },
  /** Leave this screen for the one before it, or for the News when there is none. */
  async leave() {
    if (impl.canBack?.()) { impl.back(); return; }
    const { inboxScreen } = await import('./inbox-screen.js');
    impl.reset(inboxScreen());
  },
  /** Start again from this screen. */
  reset(screen) { clearToast(); impl.reset(screen); },
  /** Swap the current screen for another without adding to the Back history. */
  replace(screen) { clearToast(); impl.replace(screen); },
  /** Redraw the sidebar (after a screen changes its sidebar items). */
  refreshSide() { impl.refreshSide(); },
};

/**
 * A screen is { el, side?: () => SideItem[], dateBox?: () => Node[], onShow?(), onHide?() }.
 * SideItem is { label, sub?, hl?, on?, disabled?, onClick }.
 */
