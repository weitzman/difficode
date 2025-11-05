# Recipe Processing Report

## Summary

- **Total recipes processed:** 60
- **Successful:** 48
- **Failed:** 17
- **Success rate:** 80.0%

## ❌ Errors Encountered

### 🔒 Disabled Recipes (7)

- **adobe/privacy.json**: HTTP2 protocol error - site blocking automated access
- **adobe/terms.json**: HTTP2 protocol error - site blocking automated access
- **linkedin/terms.json**: Javascript required
- **lyft/privacy.json**: Javascript required
- **slack/dmca.json**: Page structure changed
- **slack/tos_customer.json**: Unknown
- **verizon/wireless-customer-agreement.json**: Page timeout - site may require login or have anti-bot protection

### 🎯 Selector Not Found (5)

- **amazon/aws_terms.json**: Selector ".lb-content" not found, used body fallback
- **amazon/privacy.json**: Selector "#help-content" not found, used body fallback
- **linkedin/privacy.json**: Selector "div#main" not found, used body fallback
- **paypal/privacy.json**: Selector ".center-block" not found, used body fallback
- **paypal/terms.json**: Selector "#main" not found, used body fallback

### 🔄 Fetch Errors (3)

- **cloudflare/terms.json**: Playwright fetch failed: page.goto: Timeout 30000ms exceeded.
Call log:
[2m  - navigating to "https://www.cloudflare.com/website-terms/", waiting until "networkidle"[22m

- **shopify/privacy.json**: Playwright fetch failed: page.goto: Timeout 30000ms exceeded.
Call log:
[2m  - navigating to "https://www.shopify.com/legal/privacy", waiting until "networkidle"[22m

- **shopify/terms.json**: Playwright fetch failed: page.goto: Timeout 30000ms exceeded.
Call log:
[2m  - navigating to "https://www.shopify.com/legal/terms", waiting until "networkidle"[22m


### 🌐 Missing URL (1)

- **lyft/maintainers.json**: Recipe missing required URL field

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
- **Recipe:** amazon/aws_terms.json
- **Type:** 🎯 Selector Not Found
- **Message:** Selector ".lb-content" not found, used body fallback

### Error 4
- **Recipe:** amazon/privacy.json
- **Type:** 🎯 Selector Not Found
- **Message:** Selector "#help-content" not found, used body fallback

### Error 5
- **Recipe:** cloudflare/terms.json
- **Type:** 🔄 Fetch Errors
- **Message:** Playwright fetch failed: page.goto: Timeout 30000ms exceeded.
Call log:
[2m  - navigating to "https://www.cloudflare.com/website-terms/", waiting until "networkidle"[22m


### Error 6
- **Recipe:** linkedin/privacy.json
- **Type:** 🎯 Selector Not Found
- **Message:** Selector "div#main" not found, used body fallback

### Error 7
- **Recipe:** linkedin/terms.json
- **Type:** 🔒 Disabled Recipes
- **Message:** Javascript required

### Error 8
- **Recipe:** lyft/maintainers.json
- **Type:** 🌐 Missing URL
- **Message:** Recipe missing required URL field

### Error 9
- **Recipe:** lyft/privacy.json
- **Type:** 🔒 Disabled Recipes
- **Message:** Javascript required

### Error 10
- **Recipe:** paypal/privacy.json
- **Type:** 🎯 Selector Not Found
- **Message:** Selector ".center-block" not found, used body fallback

### Error 11
- **Recipe:** paypal/terms.json
- **Type:** 🎯 Selector Not Found
- **Message:** Selector "#main" not found, used body fallback

### Error 12
- **Recipe:** shopify/privacy.json
- **Type:** 🔄 Fetch Errors
- **Message:** Playwright fetch failed: page.goto: Timeout 30000ms exceeded.
Call log:
[2m  - navigating to "https://www.shopify.com/legal/privacy", waiting until "networkidle"[22m


### Error 13
- **Recipe:** shopify/terms.json
- **Type:** 🔄 Fetch Errors
- **Message:** Playwright fetch failed: page.goto: Timeout 30000ms exceeded.
Call log:
[2m  - navigating to "https://www.shopify.com/legal/terms", waiting until "networkidle"[22m


### Error 14
- **Recipe:** slack/dmca.json
- **Type:** 🔒 Disabled Recipes
- **Message:** Page structure changed

### Error 15
- **Recipe:** slack/tos_customer.json
- **Type:** 🔒 Disabled Recipes
- **Message:** Unknown

### Error 16
- **Recipe:** verizon/wireless-customer-agreement.json
- **Type:** 🔒 Disabled Recipes
- **Message:** Page timeout - site may require login or have anti-bot protection

### Error 17
- **Recipe:** xfinity/privacy.json
- **Type:** 🚫 HTTP Errors
- **Message:** HTTP 403 error when fetching https://www.xfinity.com/privacy/policy

