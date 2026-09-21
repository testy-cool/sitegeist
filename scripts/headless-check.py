# /// script
# dependencies = ["playwright"]
# ///
"""Load the built extension into a throwaway headless Chromium and send one message.

Nothing touches a real browser: the profile is a temp dir, deleted on exit.

    uv run scripts/headless-check.py "Reply with exactly: hi"
    BIFROST_KEY=$(llm keys get bifrost) uv run scripts/headless-check.py --key bifrost "..."
    uv run scripts/headless-check.py --capture "/google-calendar-events hi"   # print request bodies, fake a 500

--key PROVIDER stores $<PROVIDER>_KEY (upper-cased, "-" -> "_") before the panel loads, so the
setup dialog does not appear and the panel opens on that provider's default model.
--capture intercepts every non-extension request, prints its body and answers 500, so no model
is called; use it with any dummy key to see exactly what would be sent.
Writes a screenshot to /tmp/headless-check.png.

Traps this script already handles, each of which cost a run:
- Only the "chromium" channel loads an unpacked extension; the default headless shell does not.
- The panel shows a permission screen until "Allow user scripts" is switched on.
- The panel CSP forbids eval, so page.wait_for_function fails; poll with page.evaluate instead.
- time.sleep starves Playwright's event loop, so routes never fire; use page.wait_for_timeout.
"""

import argparse
import json
import os
import shutil
import tempfile
from pathlib import Path

from playwright.sync_api import sync_playwright

EXT = str(Path(__file__).resolve().parent.parent / "dist-chrome")
PANEL = "document.querySelector('pi-chat-panel')"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("message")
    ap.add_argument("--key", help="provider whose key to store, read from $<PROVIDER>_KEY")
    ap.add_argument("--capture", action="store_true", help="print outgoing request bodies instead of calling the model")
    ap.add_argument("--timeout", type=int, default=90, help="seconds to wait for the agent to finish")
    args = ap.parse_args()

    profile = tempfile.mkdtemp()
    try:
        with sync_playwright() as p:
            ctx = p.chromium.launch_persistent_context(
                profile,
                headless=True,
                channel="chromium",
                args=[f"--disable-extensions-except={EXT}", f"--load-extension={EXT}"],
                viewport={"width": 420, "height": 800},
            )
            sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker")
            ext_id = sw.url.split("/")[2]

            if args.capture:
                def handle(route):
                    print("REQUEST", route.request.method, route.request.url)
                    print(route.request.post_data or "")
                    route.fulfill(status=500, body='{"error":"headless-check capture"}')

                ctx.route(lambda url: not url.startswith("chrome-extension://"), handle)

            page = ctx.new_page()
            page.goto(f"chrome://extensions/?id={ext_id}")
            page.locator("#allow-user-scripts").click()
            page.wait_for_timeout(1000)

            page.goto(f"chrome-extension://{ext_id}/sidepanel.html")
            page.wait_for_timeout(3000)
            if args.key:
                env = f"{args.key.upper().replace('-', '_')}_KEY"
                key = os.environ.get(env) or ("sk-dummy" if args.capture else None)
                if not key:
                    raise SystemExit(f"${env} is not set")
                page.evaluate(
                    """([provider, key]) => new Promise((res, rej) => {
                        const r = indexedDB.open('sitegeist-storage');
                        r.onsuccess = () => {
                            const tx = r.result.transaction('provider-keys', 'readwrite');
                            tx.objectStore('provider-keys').put(key, provider);
                            tx.oncomplete = res; tx.onerror = rej;
                        };
                    })""",
                    [args.key, key],
                )
                page.reload()

            for _ in range(60):
                if page.evaluate(f"() => !!{PANEL}?.agent?.state?.model"):
                    break
                page.wait_for_timeout(500)
            model = page.evaluate(f"() => {{ const m = {PANEL}.agent.state.model; return m.provider + ' ' + m.id }}")
            print("model:", model)

            page.evaluate(f"(m) => {PANEL}.agentInterface.sendMessage(m)", args.message)
            for _ in range(args.timeout):
                page.wait_for_timeout(1000)
                if not page.evaluate(f"() => {PANEL}.agent.state.isStreaming"):
                    break

            messages = page.evaluate(
                f"""() => {PANEL}.agent.state.messages.map(m => ({{
                    role: m.role,
                    stop: m.stopReason,
                    error: m.errorMessage,
                    content: Array.isArray(m.content)
                        ? m.content.map(c => c.type + ': ' + (c.text || c.name || c.thinking || '').slice(0, 300))
                        : String(m.content ?? '').slice(0, 300),
                }}))"""
            )
            for m in messages:
                print(json.dumps({k: v for k, v in m.items() if v}, ensure_ascii=False))
            page.screenshot(path="/tmp/headless-check.png")
            ctx.close()
    finally:
        shutil.rmtree(profile, ignore_errors=True)


if __name__ == "__main__":
    main()
