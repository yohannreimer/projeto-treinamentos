from playwright.sync_api import sync_playwright

BASE_URL = "http://localhost:5173"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 1000})
    console_messages = []
    page.on("console", lambda msg: console_messages.append(f"{msg.type}: {msg.text}"))
    page.goto(BASE_URL + "/financeiro/overview")
    page.wait_for_load_state("networkidle")

    if page.get_by_label("Usuário").count() > 0:
        page.get_by_label("Usuário").fill("admin")
        page.get_by_label("Senha").fill("Holand2026!@#")
        page.get_by_role("button", name="Entrar").click()
        page.wait_for_load_state("networkidle")
        page.goto(BASE_URL + "/financeiro/overview")
        page.wait_for_load_state("networkidle")

    routes = [
        "/financeiro/overview",
        "/financeiro/transactions",
        "/financeiro/receivables",
        "/financeiro/payables",
        "/financeiro/reconciliation",
        "/financeiro/cashflow",
        "/financeiro/reports",
        "/financeiro/cadastros",
    ]

    for route in routes:
        page.goto(BASE_URL + route)
        page.wait_for_load_state("networkidle")
        print(f"\n=== {route} ===")
        print("title:", page.title())
        headings = [item.inner_text().strip() for item in page.locator("h1, h2, h3").all()[:12]]
        print("headings:", headings)
        buttons = [item.inner_text().strip() for item in page.locator("button").all()[:30]]
        print("buttons:", buttons)
        inputs = []
        for item in page.locator("input, select, textarea").all()[:40]:
            inputs.append({
                "tag": item.evaluate("el => el.tagName.toLowerCase()"),
                "type": item.get_attribute("type"),
                "name": item.get_attribute("name"),
                "placeholder": item.get_attribute("placeholder"),
                "value": item.input_value() if item.evaluate("el => ['INPUT','TEXTAREA','SELECT'].includes(el.tagName)") else "",
            })
        print("fields:", inputs)
        alerts = [item.inner_text().strip() for item in page.locator('[role="alert"], .finance-page-error, .finance-page-success').all()]
        print("alerts:", alerts)

    if console_messages:
        print("\n=== console ===")
        for message in console_messages:
            print(message)

    browser.close()
