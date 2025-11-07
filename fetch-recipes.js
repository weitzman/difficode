#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { convertToMarkdown } = require('./convert-html.js');

// Browser configuration constants
const BROWSER_CONFIG = {
    headless: true,
    timeout: 30000,
    args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--disable-blink-features=AutomationControlled',
        '--disable-automation',
        '--disable-browser-side-navigation',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--no-pings',
        '--password-store=basic',
        '--use-mock-keychain'
    ]
};

const CONTEXT_CONFIG = {
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 768 },
    locale: 'en-US',
    timezoneId: 'America/New_York',
    deviceScaleFactor: 1,
    hasTouch: false,
    isMobile: false,
    extraHTTPHeaders: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Cache-Control': 'max-age=0',
        'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"macOS"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1'
    }
};

/**
 * Utility functions for path handling
 */
const PathUtils = {
    /**
     * Extract relative path from recipes directory
     */
    getRelativePath(filePath, recipesDir) {
        const recipesIndex = filePath.lastIndexOf('recipes' + path.sep);
        if (recipesIndex !== -1) {
            return filePath.substring(recipesIndex + 'recipes'.length + 1);
        }
        
        if (fs.statSync(recipesDir).isFile()) {
            const pathParts = filePath.split(path.sep);
            return pathParts.length >= 2 
                ? path.join(pathParts[pathParts.length - 2], pathParts[pathParts.length - 1])
                : path.basename(filePath);
        }
        
        return path.relative(recipesDir, filePath);
    },

    /**
     * Get output path structure from relative path
     */
    getOutputPath(relativePath, outputDir) {
        const parsedPath = path.parse(relativePath);
        return {
            dir: path.join(outputDir, parsedPath.dir),
            name: parsedPath.name
        };
    },

    /**
     * Get target directory for cleaning based on recipes path
     */
    getCleanTarget(recipesDir, outputDir) {
        const stat = fs.statSync(recipesDir);
        
        if (stat.isFile()) {
            const relativePath = this.getRelativePath(recipesDir, './recipes');
            return path.join(outputDir, path.parse(relativePath).dir);
        }
        
        const recipesIndex = recipesDir.lastIndexOf('recipes');
        if (recipesIndex !== -1) {
            const relativePath = recipesDir.substring(recipesIndex + 'recipes'.length).replace(/^[\/\\]/, '');
            return relativePath ? path.join(outputDir, relativePath) : outputDir;
        }
        
        return outputDir;
    }
};

class RecipeFetcher {
    constructor(recipesDir = './recipes', outputDir = './agreements', saveHtml = false) {
        this.recipesDir = recipesDir;
        this.outputDir = outputDir;
        this.saveHtml = saveHtml;
        this.errors = [];
        this.processedCount = 0;
        this.successCount = 0;
    }

    /**
     * Clean corresponding output files for the recipes being processed
     */
    cleanOutput(targetDir = null) {
        if (targetDir) {
            // Specific target provided - clean it (directory or file)
            if (!fs.existsSync(targetDir)) {
                console.log(`📁 Target doesn't exist: ${targetDir}\n`);
                return;
            }
            
            const stat = fs.statSync(targetDir);
            if (stat.isDirectory()) {
                console.log(`🧹 Cleaning directory: ${targetDir}`);
                fs.rmSync(targetDir, { recursive: true, force: true });
            } else {
                console.log(`🧹 Cleaning file: ${targetDir}`);
                fs.rmSync(targetDir, { force: true });
            }
        } else {
            // Clean corresponding output files for each recipe being processed
            const jsonFiles = this.getRecipeFiles();
            
            console.log(`🧹 Cleaning output files for ${jsonFiles.length} recipes`);
            
            for (const filePath of jsonFiles) {
                const relativePath = PathUtils.getRelativePath(filePath, this.recipesDir);
                const outputPath = PathUtils.getOutputPath(relativePath, this.outputDir);
                
                // Clean both .md and .html files
                const markdownFile = path.join(outputPath.dir, `${outputPath.name}.md`);
                const htmlFile = path.join(outputPath.dir, `${outputPath.name}.html`);
                
                if (fs.existsSync(markdownFile)) {
                    console.log(`🗑️  Removing: ${markdownFile}`);
                    fs.rmSync(markdownFile, { force: true });
                }
                
                if (fs.existsSync(htmlFile)) {
                    console.log(`🗑️  Removing: ${htmlFile}`);
                    fs.rmSync(htmlFile, { force: true });
                }
                
                // Remove empty parent directories
                this.removeEmptyDirs(outputPath.dir);
            }
        }
    }

    /**
     * Remove empty directories recursively up to the output directory
     */
    removeEmptyDirs(dir) {
        if (dir === this.outputDir || !fs.existsSync(dir)) {
            return;
        }
        
        try {
            const items = fs.readdirSync(dir);
            if (items.length === 0) {
                console.log(`🗑️  Removing empty directory: ${dir}`);
                fs.rmdirSync(dir);
                // Recursively check parent directory
                this.removeEmptyDirs(path.dirname(dir));
            }
        } catch (error) {
            // Ignore errors - directory might not be empty or might have permission issues
        }
    }

    /**
     * Main entry point for recipe processing
     */
    async fetchRecipes() {
        console.log('Starting recipe fetching...\n');
        
        // Check if paths exist - handle both single path and array of paths
        if (Array.isArray(this.recipesDir)) {
            for (const recipePath of this.recipesDir) {
                if (!fs.existsSync(recipePath)) {
                    console.error(`Error: recipes path not found: ${recipePath}`);
                    return;
                }
            }
        } else {
            if (!fs.existsSync(this.recipesDir)) {
                console.error('Error: recipes path not found');
                return;
            }
        }

        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }

        const jsonFiles = this.getRecipeFiles();
        console.log(`Found ${jsonFiles.length} recipe files\n`);

        // Reset counters for this run
        this.errors = [];
        this.processedCount = 0;
        this.successCount = 0;

        for (const filePath of jsonFiles) {
            await this.processRecipe(filePath);
        }

        console.log('Recipe fetching completed!');
        
        // Always write error report
        await this.writeErrorReport();
    }

    /**
     * Get all recipe JSON files from the recipes directory or array of paths
     */
    getRecipeFiles() {
        // Handle array of recipe paths
        if (Array.isArray(this.recipesDir)) {
            const allFiles = [];
            for (const recipePath of this.recipesDir) {
                const files = this.getRecipeFilesFromPath(recipePath);
                allFiles.push(...files);
            }
            return allFiles;
        }
        
        // Handle single path (original behavior)
        return this.getRecipeFilesFromPath(this.recipesDir);
    }

    /**
     * Get recipe files from a single path (file or directory)
     */
    getRecipeFilesFromPath(recipePath) {
        if (!fs.existsSync(recipePath)) {
            console.error(`Error: ${recipePath} does not exist`);
            return [];
        }

        const stat = fs.statSync(recipePath);
        
        if (stat.isFile()) {
            if (path.extname(recipePath) !== '.json') {
                console.error(`Error: ${recipePath} is not a JSON file`);
                return [];
            }
            return [recipePath];
        }
        
        if (stat.isDirectory()) {
            return this.findJsonFiles(recipePath);
        }
        
        console.error(`Error: ${recipePath} is neither a file nor a directory`);
        return [];
    }

    /**
     * Recursively find all JSON files in directory
     */
    findJsonFiles(dir) {
        const files = [];
        const items = fs.readdirSync(dir);
        
        for (const item of items) {
            const itemPath = path.join(dir, item);
            const stat = fs.statSync(itemPath);
            
            if (stat.isDirectory()) {
                files.push(...this.findJsonFiles(itemPath));
            } else if (stat.isFile() && path.extname(item) === '.json') {
                files.push(itemPath);
            }
        }
        
        return files;
    }

    /**
     * Process a single recipe file
     */
    async processRecipe(filePath) {
        const relativePath = PathUtils.getRelativePath(filePath, this.recipesDir);
        console.log(`Processing: ${relativePath}`);
        this.processedCount++;

        try {
            const recipe = this.loadRecipe(filePath);
            
            if (!this.validateRecipe(recipe, relativePath)) {
                return;
            }

            console.log(`URL: ${recipe.url}`);
            console.log(`Selector: ${recipe.selector}`);

            const html = await this.fetchUrl(recipe.url, relativePath);
            if (!html) {
                console.log('❌ Failed to fetch HTML, skipping\n');
                return;
            }

            const outputPath = PathUtils.getOutputPath(relativePath, this.outputDir);
            const success = await this.saveFiles(outputPath, html, recipe, relativePath);
            
            if (success) {
                console.log('✅ Success\n');
                this.successCount++;
            }

        } catch (error) {
            console.error(`Error processing ${relativePath}: ${error.message}\n`);
            // Only record processing error if no other error was already recorded for this recipe
            if (!this.errors.some(e => e.recipe === relativePath)) {
                this.recordError(relativePath, 'processing_error', error.message);
            }
        }
    }

    /**
     * Load and parse recipe with defaults
     */
    loadRecipe(filePath) {
        const content = fs.readFileSync(filePath, 'utf8');
        const recipe = JSON.parse(content);
        // Handle enabled field - convert string/number to boolean
        if (recipe.enabled !== undefined) {
            // Convert string "0" or number 0 to false, everything else to true
            recipe.enabled = recipe.enabled !== 0 && recipe.enabled !== "0";
        } else {
            recipe.enabled = true; // Default to enabled if not specified
        }
        return recipe;
    }

    /**
     * Validate recipe has required fields
     */
    validateRecipe(recipe, relativePath) {
        if (!recipe.enabled) {
            const reason = recipe.reason || 'No reason provided';
            console.log('Recipe disabled, skipping\n');
            this.recordError(relativePath, 'disabled_recipe', reason);
            return false;
        }

        if (!recipe.url) {
            console.log('Missing required field (url), skipping\n');
            this.recordError(relativePath, 'missing_url', 'Recipe missing required URL field');
            return false;
        }

        // Set default selector if not provided
        if (!recipe.selector) {
            recipe.selector = 'body';
        }

        return true;
    }

    /**
     * Fetch URL content using Playwright
     */
    async fetchUrl(url, relativePath) {
        let browser;
        try {
            console.log('Launching browser...');
            browser = await chromium.launch(BROWSER_CONFIG);
            const context = await browser.newContext(CONTEXT_CONFIG);
            const page = await context.newPage();
            
            // Add stealth measures
            await this.addStealthScript(page);
            
            // Add random delay before navigation (1-3 seconds)
            const preNavigationDelay = Math.floor(Math.random() * 2000) + 1000;
            await page.waitForTimeout(preNavigationDelay);
            
            console.log('Navigating to URL...');
            const response = await page.goto(url, { 
                waitUntil: 'domcontentloaded', 
                timeout: 45000 
            });
            
            // Check HTTP status code
            const status = response.status();
            if (status >= 400) {
                console.error(`❌ HTTP Error ${status}: Failed to fetch ${url}`);
                this.recordError(relativePath, 'http_error', `HTTP ${status} error when fetching ${url}`);
                return null;
            }
            
            // Random human-like behavior
            await this.simulateHumanBehavior(page);
            
            // Wait for dynamic content with longer timeout for challenging sites
            const contentDelay = Math.floor(Math.random() * 3000) + 4000; // 4-7 seconds
            await page.waitForTimeout(contentDelay);
            
            console.log('Getting page content...');
            return await page.content();
            
        } catch (error) {
            this.recordError(relativePath, 'fetch_error', `Playwright fetch failed: ${error.message}`);
            throw new Error(`Playwright fetch failed: ${error.message}`);
        } finally {
            if (browser) {
                await browser.close();
            }
        }
    }

    /**
     * Simulate human-like behavior on the page
     */
    async simulateHumanBehavior(page) {
        try {
            // Random mouse movements
            await page.mouse.move(
                Math.floor(Math.random() * 800) + 100,
                Math.floor(Math.random() * 600) + 100
            );
            
            // Random scroll simulation
            const scrollAmount = Math.floor(Math.random() * 500) + 200;
            await page.evaluate((amount) => {
                window.scrollBy(0, amount);
            }, scrollAmount);
            
            // Small delay
            await page.waitForTimeout(Math.floor(Math.random() * 1000) + 500);
            
            // Scroll back up
            await page.evaluate(() => {
                window.scrollTo(0, 0);
            });
            
        } catch (error) {
            // Ignore errors in simulation - not critical
        }
    }

    /**
     * Add comprehensive stealth measures to avoid detection
     */
    async addStealthScript(page) {
        await page.addInitScript(() => {
            // Remove webdriver property
            delete navigator.webdriver;
            
            // Override navigator properties with realistic values
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined,
            });
            
            Object.defineProperty(navigator, 'plugins', {
                get: () => [
                    { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
                    { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
                    { name: 'Native Client', filename: 'internal-nacl-plugin' }
                ],
            });
            
            Object.defineProperty(navigator, 'languages', {
                get: () => ['en-US', 'en'],
            });
            
            Object.defineProperty(navigator, 'permissions', {
                get: () => ({
                    query: () => Promise.resolve({ state: 'granted' }),
                }),
            });
            
            // Override chrome runtime
            if (navigator.chrome) {
                Object.defineProperty(navigator.chrome, 'runtime', {
                    get: () => ({
                        onConnect: undefined,
                        onMessage: undefined,
                    }),
                });
            }
            
            // Mock realistic screen properties
            Object.defineProperty(screen, 'colorDepth', { get: () => 24 });
            Object.defineProperty(screen, 'pixelDepth', { get: () => 24 });
            
            // Override Date to prevent timezone detection inconsistencies
            const originalDate = Date;
            Date = class extends originalDate {
                getTimezoneOffset() { return 300; } // EST timezone offset
            };
            
            // Add realistic connection properties
            Object.defineProperty(navigator, 'connection', {
                get: () => ({
                    effectiveType: '4g',
                    rtt: 100,
                    downlink: 2.0,
                }),
            });
            
            // Remove automation indicators
            if (window.chrome && window.chrome.runtime && window.chrome.runtime.onConnect) {
                delete window.chrome.runtime.onConnect;
            }
            
            // Mock realistic battery API
            Object.defineProperty(navigator, 'getBattery', {
                get: () => () => Promise.resolve({
                    charging: true,
                    chargingTime: 0,
                    dischargingTime: Infinity,
                    level: 1,
                }),
            });
        });
    }

    /**
     * Save HTML and markdown files
     */
    async saveFiles(outputPath, html, recipe, relativePath) {
        try {
            if (!fs.existsSync(outputPath.dir)) {
                fs.mkdirSync(outputPath.dir, { recursive: true });
            }

            // Convert to markdown first to get cleaned HTML
            const result = convertToMarkdown(html, recipe.url, recipe.selector, recipe.rules);
            
            if (result.markdown) {
                // Save cleaned HTML only if --html flag is provided
                if (this.saveHtml) {
                    const htmlFile = path.join(outputPath.dir, `${outputPath.name}.html`);
                    fs.writeFileSync(htmlFile, result.cleanedHTML || html);
                    console.log(`Saved: ${htmlFile}`);
                }

                // Save markdown
                const markdownFile = path.join(outputPath.dir, `${outputPath.name}.md`);
                fs.writeFileSync(markdownFile, result.markdown);
                console.log(`Saved: ${markdownFile}`);
                
                // Track if selector was not found
                if (!result.selectorFound) {
                    this.recordError(relativePath, 'selector_not_found', `Selector "${recipe.selector}" not found, used body fallback`);
                }
                
                return true;
            } else {
                console.log('Failed to convert to markdown');
                this.recordError(relativePath, 'markdown_conversion_error', 'Failed to convert HTML to markdown');
                return false;
            }
        } catch (error) {
            this.recordError(relativePath, 'file_save_error', `Failed to save files: ${error.message}`);
            return false;
        }
    }

    /**
     * Record an error that occurred during processing
     */
    recordError(recipePath, errorType, message) {
        this.errors.push({
            recipe: recipePath,
            type: errorType,
            message: message,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Write error report to report.md file
     */
    async writeErrorReport() {
        const reportPath = 'report.md';
        
        try {
            let report = '# Recipe Processing Report\n\n';
            report += `## Summary\n\n`;
            report += `- **Total recipes processed:** ${this.processedCount}\n`;
            report += `- **Successful:** ${this.successCount}\n`;
            report += `- **Failed:** ${this.errors.length}\n`;
            report += `- **Success rate:** ${this.processedCount > 0 ? ((this.successCount / this.processedCount) * 100).toFixed(1) : 0}%\n\n`;

            if (this.errors.length === 0) {
                report += '## 🎉 All Recipes Processed Successfully!\n\n';
                report += 'No errors occurred during this run.\n';
            } else {
                report += '## ❌ Errors Encountered\n\n';
                
                // Group errors by type
                const errorsByType = {};
                this.errors.forEach(error => {
                    if (!errorsByType[error.type]) {
                        errorsByType[error.type] = [];
                    }
                    errorsByType[error.type].push(error);
                });

                // Write errors by type
                for (const [errorType, errors] of Object.entries(errorsByType)) {
                    const typeTitle = this.getErrorTypeTitle(errorType);
                    report += `### ${typeTitle} (${errors.length})\n\n`;
                    
                    errors.forEach(error => {
                        report += `- **${error.recipe}**: ${error.message}\n`;
                    });
                    report += '\n';
                }

                // Detailed error log
                report += '## Detailed Error Log\n\n';
                this.errors.forEach((error, index) => {
                    report += `### Error ${index + 1}\n`;
                    report += `- **Recipe:** ${error.recipe}\n`;
                    report += `- **Type:** ${this.getErrorTypeTitle(error.type)}\n`;
                    report += `- **Message:** ${error.message}\n\n`;
                });
            }

            fs.writeFileSync(reportPath, report);
            console.log(`📊 Error report written to: ${reportPath}`);
            
            if (this.errors.length > 0) {
                console.log(`⚠️  ${this.errors.length} error(s) occurred during processing. See report.md for details.`);
            }
        } catch (error) {
            console.error(`Failed to write error report: ${error.message}`);
        }
    }

    /**
     * Get human-readable title for error type
     */
    getErrorTypeTitle(errorType) {
        const titles = {
            'disabled_recipe': '🔒 Disabled Recipes',
            'missing_url': '🌐 Missing URL',
            'http_error': '🚫 HTTP Errors',
            'fetch_error': '🔄 Fetch Errors',
            'markdown_conversion_error': '📝 Markdown Conversion Errors',
            'file_save_error': '💾 File Save Errors',
            'processing_error': '⚙️ Processing Errors',
            'selector_not_found': '🎯 Selector Not Found'
        };
        return titles[errorType] || '❓ Unknown Error';
    }
}

/**
 * Command line argument parser
 */
function parseArgs() {
    const args = process.argv.slice(2);
    const config = {
        recipesDir: './recipes',
        outputDir: './agreements',
        shouldClean: false,
        showHelp: false,
        saveHtml: false
    };

    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '--recipes':
                // Collect all values until next flag or end of args
                const recipePaths = [];
                i++; // Move past --recipes
                while (i < args.length && !args[i].startsWith('--')) {
                    recipePaths.push(args[i]);
                    i++;
                }
                i--; // Back up one since loop will increment
                
                if (recipePaths.length > 0) {
                    config.recipesDir = recipePaths.length === 1 ? recipePaths[0] : recipePaths;
                }
                break;
            case '--output':
                if (i + 1 < args.length) {
                    config.outputDir = args[++i];
                }
                break;
            case '--clean':
                config.shouldClean = true;
                break;
            case '--html':
                config.saveHtml = true;
                break;
            case '--help':
                config.showHelp = true;
                break;
        }
    }

    return config;
}

/**
 * Show help information
 */
function showHelp() {
    console.log('Usage: node fetch-recipes.js [--recipes <path> [<path2> ...]] [--output <dir>] [--clean] [--html]');
    console.log('  --recipes <path>  Recipe file(s) or directory(ies) (default: ./recipes)');
    console.log('                    Can specify multiple paths separated by spaces');
    console.log('  --output <dir>    Output directory (default: ./agreements)');
    console.log('  --clean           Clean corresponding output files before processing');
    console.log('                    - Removes .md and .html files for specified recipes');
    console.log('                    - Removes empty directories after file deletion');
    console.log('                    - Useful when recipes are disabled to clean up old output');
    console.log('  --html            Save cleaned HTML files in addition to Markdown files');
    console.log('');
    console.log('Examples:');
    console.log('  node fetch-recipes.js --recipes recipes/facebook/privacy.json --clean');
    console.log('  node fetch-recipes.js --recipes recipes/verizon/ --clean');
    console.log('  node fetch-recipes.js --recipes recipes/facebook/ recipes/google/ recipes/apple.json');
    console.log('  node fetch-recipes.js --clean');
    console.log('  node fetch-recipes.js --recipes recipes/');
}

/**
 * Main CLI execution
 */
async function main() {
    const config = parseArgs();
    
    if (config.showHelp) {
        showHelp();
        process.exit(0);
    }

    const fetcher = new RecipeFetcher(config.recipesDir, config.outputDir, config.saveHtml);
    
    // Handle cleaning if requested
    if (config.shouldClean) {
        // When specific recipes are provided, clean only their corresponding output files
        // When no specific recipes (full run), clean all output files
        fetcher.cleanOutput();
    }
    
    await fetcher.fetchRecipes();
}

// Run CLI if called directly
if (require.main === module) {
    main().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

module.exports = RecipeFetcher;