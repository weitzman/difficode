# Recipe Processing Report

## Summary

- **Total recipes processed:** 58
- **Successful:** 50
- **Failed:** 10
- **Success rate:** 86.2%

## ❌ Errors Encountered

### 🔒 Disabled Recipes (3)

- **adobe/privacy.json**: HTTP2 protocol error - site blocking automated access
- **adobe/terms.json**: HTTP2 protocol error - site blocking automated access
- **verizon/wireless-customer-agreement.json**: Page timeout - site may require login or have anti-bot protection

### 🚫 HTTP Errors (2)

- **amazon/amazoncom-privacy.json**: HTTP 403 error when fetching https://www.amazon.com/gp/help/customer/display.html?nodeId=468496
- **xfinity/privacy.json**: HTTP 403 error when fetching https://www.xfinity.com/privacy/policy

### 🔄 Fetch Errors (3)

- **cloudflare/terms.json**: Playwright fetch failed: page.goto: Timeout 30000ms exceeded.
Call log:
  - navigating to "https://www.cloudflare.com/website-terms/", waiting until "networkidle"

- **slack/transparency_report.json**: Playwright fetch failed: page.goto: Timeout 30000ms exceeded.
Call log:
  - navigating to "https://slack.com/trust/data-request/transparency-report", waiting until "networkidle"

- **xfinity/terms.json**: Playwright fetch failed: page.goto: Timeout 30000ms exceeded.
Call log:
  - navigating to "https://my.xfinity.com/terms/web/", waiting until "networkidle"


### 🎯 Selector Not Found (2)

- **shopify/privacy.json**: Selector ".main-content" not found, used body fallback
- **shopify/terms.json**: Selector ".main-content" not found, used body fallback

## Detailed Error Log

### Error 1
- **Recipe:** adobe/privacy.json
- **Type:** 🔒 Disabled Recipes
- **Message:** HTTP2 protocol error - site blocking automated access

### Error 2
- **Recipe:** adobe/terms.json
- **Type:** 🔒 Disabled Recipes
- **Message:** HTTP2 protocol error - site blocking automated access

### Error 3
- **Recipe:** amazon/amazoncom-privacy.json
- **Type:** 🚫 HTTP Errors
- **Message:** HTTP 403 error when fetching https://www.amazon.com/gp/help/customer/display.html?nodeId=468496

### Error 4
- **Recipe:** cloudflare/terms.json
- **Type:** 🔄 Fetch Errors
- **Message:** Playwright fetch failed: page.goto: Timeout 30000ms exceeded.
Call log:
  - navigating to "https://www.cloudflare.com/website-terms/", waiting until "networkidle"


### Error 5
- **Recipe:** shopify/privacy.json
- **Type:** 🎯 Selector Not Found
- **Message:** Selector ".main-content" not found, used body fallback

### Error 6
- **Recipe:** shopify/terms.json
- **Type:** 🎯 Selector Not Found
- **Message:** Selector ".main-content" not found, used body fallback

### Error 7
- **Recipe:** slack/transparency_report.json
- **Type:** 🔄 Fetch Errors
- **Message:** Playwright fetch failed: page.goto: Timeout 30000ms exceeded.
Call log:
  - navigating to "https://slack.com/trust/data-request/transparency-report", waiting until "networkidle"


### Error 8
- **Recipe:** verizon/wireless-customer-agreement.json
- **Type:** 🔒 Disabled Recipes
- **Message:** Page timeout - site may require login or have anti-bot protection

### Error 9
- **Recipe:** xfinity/privacy.json
- **Type:** 🚫 HTTP Errors
- **Message:** HTTP 403 error when fetching https://www.xfinity.com/privacy/policy

### Error 10
- **Recipe:** xfinity/terms.json
- **Type:** 🔄 Fetch Errors
- **Message:** Playwright fetch failed: page.goto: Timeout 30000ms exceeded.
Call log:
  - navigating to "https://my.xfinity.com/terms/web/", waiting until "networkidle"


