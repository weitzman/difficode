# Recipe Processing Report

## Summary

- **Total recipes processed:** 58
- **Successful:** 49
- **Failed:** 9
- **Success rate:** 84.5%

## ❌ Errors Encountered

### 🔒 Disabled Recipes (3)

- **adobe/privacy.json**: HTTP2 protocol error - site blocking automated access
- **adobe/terms.json**: HTTP2 protocol error - site blocking automated access
- **verizon/wireless-customer-agreement.json**: Page timeout - site may require login or have anti-bot protection

### 🔄 Fetch Errors (5)

- **cloudflare/terms.json**: Playwright fetch failed: page.goto: Timeout 30000ms exceeded.
Call log:
[2m  - navigating to "https://www.cloudflare.com/website-terms/", waiting until "networkidle"[22m

- **shopify/privacy.json**: Playwright fetch failed: page.goto: Timeout 30000ms exceeded.
Call log:
[2m  - navigating to "https://www.shopify.com/legal/privacy", waiting until "networkidle"[22m

- **shopify/terms.json**: Playwright fetch failed: page.goto: Timeout 30000ms exceeded.
Call log:
[2m  - navigating to "https://www.shopify.com/legal/terms", waiting until "networkidle"[22m

- **slack/tos_user.json**: Playwright fetch failed: page.goto: Timeout 30000ms exceeded.
Call log:
[2m  - navigating to "https://slack.com/terms-of-service/user", waiting until "networkidle"[22m

- **xfinity/terms.json**: Playwright fetch failed: page.goto: Timeout 30000ms exceeded.
Call log:
[2m  - navigating to "https://my.xfinity.com/terms/web/", waiting until "networkidle"[22m


### 🚫 HTTP Errors (1)

- **xfinity/privacy.json**: HTTP 403 error when fetching https://www.xfinity.com/privacy/policy

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
- **Recipe:** cloudflare/terms.json
- **Type:** 🔄 Fetch Errors
- **Message:** Playwright fetch failed: page.goto: Timeout 30000ms exceeded.
Call log:
[2m  - navigating to "https://www.cloudflare.com/website-terms/", waiting until "networkidle"[22m


### Error 4
- **Recipe:** shopify/privacy.json
- **Type:** 🔄 Fetch Errors
- **Message:** Playwright fetch failed: page.goto: Timeout 30000ms exceeded.
Call log:
[2m  - navigating to "https://www.shopify.com/legal/privacy", waiting until "networkidle"[22m


### Error 5
- **Recipe:** shopify/terms.json
- **Type:** 🔄 Fetch Errors
- **Message:** Playwright fetch failed: page.goto: Timeout 30000ms exceeded.
Call log:
[2m  - navigating to "https://www.shopify.com/legal/terms", waiting until "networkidle"[22m


### Error 6
- **Recipe:** slack/tos_user.json
- **Type:** 🔄 Fetch Errors
- **Message:** Playwright fetch failed: page.goto: Timeout 30000ms exceeded.
Call log:
[2m  - navigating to "https://slack.com/terms-of-service/user", waiting until "networkidle"[22m


### Error 7
- **Recipe:** verizon/wireless-customer-agreement.json
- **Type:** 🔒 Disabled Recipes
- **Message:** Page timeout - site may require login or have anti-bot protection

### Error 8
- **Recipe:** xfinity/privacy.json
- **Type:** 🚫 HTTP Errors
- **Message:** HTTP 403 error when fetching https://www.xfinity.com/privacy/policy

### Error 9
- **Recipe:** xfinity/terms.json
- **Type:** 🔄 Fetch Errors
- **Message:** Playwright fetch failed: page.goto: Timeout 30000ms exceeded.
Call log:
[2m  - navigating to "https://my.xfinity.com/terms/web/", waiting until "networkidle"[22m


