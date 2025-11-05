# Diffi - Legal Agreement Change Tracking

See the [output](/output) subdirectory for a historical record of many legal agreements on the web.

A simple Node application which processes 'recipe' files and records their output in the /output directory. A recipe is a small JSON file detailing the URL of an organization's Privacy policy or Terms of Service. This provides an excellent history of changes. In addition to saving a full HTML file, we save a Markdown variant for easy browsing and change presentation.

## Recipe Format

Recipes are JSON files that define how to extract content from web pages:

```json
{
  "url": "https://example.com/page",
  "selector": "#main-content",
  "enabled": 1,
  "rules": [
    {"name": "remove-nav", "filter": "nav", "replacement": ""},
    {"name": "remove-footer", "filter": "footer", "replacement": ""}
  ]
}
```

Example of a disabled recipe:
```json
{
  "url": "https://example.com/broken-page",
  "selector": "#content",
  "enabled": 0,
  "reason": "Site requires authentication"
}
```

### Recipe Fields

- **url** (required): The URL to fetch content from
- **selector** (optional): CSS selector for the main content area (defaults to `body`)
- **enabled** (required): 1 to enable, 0 to disable this recipe
- **reason** (optional): When recipe is disabled, explanation for why it's disabled
- **rules** (optional): Array of turndown.js rules for removing unwanted elements

### Turndown.js Rules

Rules allow you to remove or transform specific HTML elements before conversion to markdown:

```json
"rules": [
  {"name": "remove-nav", "filter": "nav", "replacement": ""},
  {"name": "remove-header", "filter": "header", "replacement": ""},
  {"name": "remove-footer", "filter": "footer", "replacement": ""},
  {"name": "remove-cookies", "filter": "[class*='cookie']", "replacement": ""},
  {"name": "remove-banner", "filter": "[class*='banner']", "replacement": ""},
  {"name": "remove-menu", "filter": "[role='menu']", "replacement": ""},
  {"name": "remove-navigation", "filter": "[role='navigation']", "replacement": ""}
]
```

Each rule has:
- **name**: Unique identifier for the rule
- **filter**: CSS selector or element name to match
- **replacement**: What to replace the element with (empty string removes it)

## Usage

```bash
# Process all recipes
node fetch-recipes.js

# Process specific recipe file
node fetch-recipes.js --recipes recipes/uber/privacy.json

# Process specific directory
node fetch-recipes.js --recipes recipes/uber/

# Custom output directory
node fetch-recipes.js --output custom-output/

# Clean output before processing
node fetch-recipes.js --clean

# Clean specific output subdirectory
node fetch-recipes.js --recipes recipes/uber/ --clean

# Clean single recipe output
node fetch-recipes.js --recipes recipes/uber/privacy.json --clean
```

### Command Line Options

- `--recipes <path>`: Recipe file or directory (default: ./recipes)
- `--output <dir>`: Output directory (default: ./output)  
- `--clean`: Clean output directory before processing
  - With `--recipes`: cleans only the corresponding output subdirectory
  - Without `--recipes`: cleans the entire output directory
- `--help`: Show usage information

### Cleaning Behavior

The `--clean` option intelligently determines what to clean based on the recipes specified:

- `node fetch-recipes.js --clean` → Cleans entire `./output/` directory
- `node fetch-recipes.js --recipes recipes/uber/ --clean` → Cleans `./output/uber/` directory
- `node fetch-recipes.js --recipes recipes/uber/privacy.json --clean` → Cleans `./output/uber/` directory

## Output

For each recipe, the tool generates:
- `output/[company]/[recipe-name].html` - Raw HTML content
- `output/[company]/[recipe-name].md` - Converted markdown content

## Examples

### Basic Recipe (no rules)
```json
{
  "url": "https://example.com/terms",
  "selector": ".content",
  "enabled": 1
}
```

### Minimal Recipe (uses default body selector)
```json
{
  "url": "https://example.com/terms",
  "enabled": 1
}
```

### Advanced Recipe (with cleanup rules)
```json
{
  "url": "https://example.com/terms",
  "selector": ".content",
  "enabled": 1,
  "rules": [
    {"name": "remove-nav", "filter": "nav", "replacement": ""},
    {"name": "remove-ads", "filter": ".advertisement", "replacement": ""},
    {"name": "clean-cookies", "filter": "[id*='cookie']", "replacement": ""}
  ]
}
```