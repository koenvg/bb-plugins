// Bounded BB 0.44.0 DOM fixture, checked in Arc at desktop and 375px on 2026-09-30.
// Native footer registration supplies the quota item; all other identities were observed live.
export function footerFixture() {
  const sidebar = document.createElement("div");
  sidebar.setAttribute("data-sidebar", "sidebar");
  sidebar.innerHTML = `
    <nav data-testid="sidebar-navigation-region">
      <div data-sidebar-navigation-item="codex-quota/quota"><button>Codex Quota</button></div>
      <div data-sidebar-navigation-item="other/quota"><button>Other quota</button></div>
    </nav>
    <div data-sidebar="footer"><ul data-sidebar="menu">
      <li data-footer-item="builtin:settings"><a href="/settings">Settings</a></li>
      <li data-footer-item="plugin:codex-quota/quota">
        <button data-sidebar="menu-button" aria-label="Codex quota" aria-describedby="existing-description">
          <svg data-icon-root aria-hidden="true"></svg><span class="sr-only">Codex quota</span>
        </button>
      </li>
      <li data-footer-item="plugin:connect/remote-access"><button>Remote access</button></li>
      <li data-footer-item="builtin:report-bug"><button>Report a bug</button></li>
    </ul></div>`;
  document.body.append(sidebar);
  return {
    sidebar,
    row: sidebar.querySelector<HTMLElement>('[data-sidebar-navigation-item="codex-quota/quota"]')!,
    item: sidebar.querySelector<HTMLElement>('[data-footer-item="plugin:codex-quota/quota"]')!,
    button: sidebar.querySelector<HTMLButtonElement>('button[aria-label="Codex quota"]')!,
  };
}
