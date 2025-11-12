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
    constructor(recipesDir = './recipes', outputDir = './agreements', saveHtml = false, concurrency = 3) {
        this.recipesDir = recipesDir;
        this.outputDir = outputDir;
        this.saveHtml = saveHtml;
        this.concurrency = concurrency;
        this.errors = [];
        this.skipped = [];
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
                    process.exit(1);
                }
            }
        } else {
            if (!fs.existsSync(this.recipesDir)) {
                console.error('Error: recipes path not found');
                process.exit(1);
            }
        }

        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }

        const jsonFiles = this.getRecipeFiles();
        
        if (jsonFiles.length === 0) {
            console.error('Error: No valid recipe files found');
            process.exit(1);
        }
        
        console.log(`Found ${jsonFiles.length} recipe files\n`);
        console.log(`Processing with concurrency: ${this.concurrency}\n`);

        // Reset counters for this run
        this.errors = [];
        this.processedCount = 0;
        this.successCount = 0;

        // Process recipes with controlled concurrency
        await this.processConcurrently(jsonFiles);

        console.log('Recipe fetching completed!');
        console.log(`📊 Results: ${this.successCount}/${this.processedCount} successful`);
        if (this.skipped.length > 0) {
            console.log(`⏭️  Skipped: ${this.skipped.length} recipes (disabled or invalid)`);
        }
        console.log('');
        
        // Always write error report
        await this.writeErrorReport();
    }

    /**
     * Process recipes with controlled concurrency using a semaphore pattern
     */
    async processConcurrently(jsonFiles) {
        const semaphore = new Array(this.concurrency).fill(null);
        let currentIndex = 0;
        
        const processNext = async (workerIndex) => {
            while (currentIndex < jsonFiles.length) {
                const index = currentIndex++;
                const filePath = jsonFiles[index];
                
                console.log(`🏃 Worker ${workerIndex + 1}: Starting ${index + 1}/${jsonFiles.length}`);
                
                try {
                    await this.processRecipe(filePath);
                } catch (error) {
                    console.error(`Worker ${workerIndex + 1}: Failed processing ${filePath}: ${error.message}`);
                }
            }
        };
        
        // Start all workers
        const workers = semaphore.map((_, index) => processNext(index));
        
        // Wait for all workers to complete
        await Promise.all(workers);
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
     * Process a single recipe file (thread-safe for concurrent execution)
     */
    async processRecipe(filePath) {
        const relativePath = PathUtils.getRelativePath(filePath, this.recipesDir);
        const startTime = Date.now();
        
        // Thread-safe counter increment
        const recipeNumber = ++this.processedCount;
        
        console.log(`[${recipeNumber}] Processing: ${relativePath}`);

        try {
            const recipe = this.loadRecipe(filePath);
            
            if (!this.validateRecipe(recipe, relativePath)) {
                console.log(`[${recipeNumber}] ⏭️  Skipped (disabled)\n`);
                return;
            }

            console.log(`[${recipeNumber}] URL: ${recipe.url}`);
            console.log(`[${recipeNumber}] Selector: ${recipe.selector}`);

            const html = await this.fetchUrl(recipe.url, relativePath);
            if (!html) {
                console.log(`[${recipeNumber}] ❌ Failed to fetch HTML, skipping\n`);
                return;
            }

            const outputPath = PathUtils.getOutputPath(relativePath, this.outputDir);
            const success = await this.saveFiles(outputPath, html, recipe, relativePath);
            
            if (success) {
                const duration = ((Date.now() - startTime) / 1000).toFixed(1);
                console.log(`[${recipeNumber}] ✅ Success (${duration}s)\n`);
                this.successCount++;
            }

        } catch (error) {
            const duration = ((Date.now() - startTime) / 1000).toFixed(1);
            console.error(`[${recipeNumber}] Error processing ${relativePath}: ${error.message} (${duration}s)\n`);
            
            // Thread-safe error recording
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
        // Default to enabled if not specified
        if (recipe.enabled === undefined) {
            recipe.enabled = true;
        }
        return recipe;
    }

    /**
     * Validate recipe has required fields
     */
    validateRecipe(recipe, relativePath) {
        if (!recipe.enabled) {
            const reason = recipe.reason || 'Recipe disabled';
            console.log('Recipe disabled, skipping\n');
            this.recordSkipped(relativePath, reason, recipe.url);
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
     * Fetch URL content using Playwright with retry logic
     */
    async fetchUrl(url, relativePath) {
        const maxRetries = 3;
        const baseDelay = 1000; // 1 second base delay
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            let browser;
            
            try {
                console.log(`Launching browser... (attempt ${attempt}/${maxRetries})`);
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
                    const isRetryableError = this.isRetryableHttpError(status);
                    console.error(`❌ HTTP Error ${status}: Failed to fetch ${url}`);
                    
                    if (isRetryableError && attempt < maxRetries) {
                        console.log(`🔄 Retryable error, will retry in ${this.calculateDelay(attempt, baseDelay)}ms...`);
                        await browser.close();
                        await this.sleep(this.calculateDelay(attempt, baseDelay));
                        continue;
                    } else {
                        this.recordError(relativePath, 'http_error', `HTTP ${status} error when fetching ${url}`, url);
                        return null;
                    }
                }
                
                // Random human-like behavior
                await this.simulateHumanBehavior(page);
                
                // Wait for dynamic content with longer timeout for challenging sites
                const contentDelay = Math.floor(Math.random() * 3000) + 4000; // 4-7 seconds
                await page.waitForTimeout(contentDelay);
                
                console.log('Getting page content...');
                const content = await page.content();
                
                if (attempt > 1) {
                    console.log(`✅ Success on attempt ${attempt}`);
                }
                
                return content;
                
            } catch (error) {
                const isRetryableError = this.isRetryableError(error);
                console.error(`❌ Attempt ${attempt} failed: ${error.message}`);
                
                if (isRetryableError && attempt < maxRetries) {
                    console.log(`🔄 Retryable error, will retry in ${this.calculateDelay(attempt, baseDelay)}ms...`);
                    await this.sleep(this.calculateDelay(attempt, baseDelay));
                } else {
                    this.recordError(relativePath, 'fetch_error', `Playwright fetch failed after ${attempt} attempts: ${error.message}`, url);
                    throw new Error(`Playwright fetch failed after ${attempt} attempts: ${error.message}`);
                }
            } finally {
                if (browser) {
                    await browser.close();
                }
            }
        }
        
        // This should never be reached due to the throw above, but just in case
        return null;
    }

    /**
     * Determine if HTTP error is retryable
     */
    isRetryableHttpError(status) {
        // Retry on server errors (5xx) and specific client errors
        return status >= 500 || // Server errors
               status === 429 || // Rate limiting
               status === 403 || // Forbidden (might be temporary blocking)
               status === 408;   // Request timeout
    }

    /**
     * Determine if error is retryable
     */
    isRetryableError(error) {
        const message = error.message.toLowerCase();
        
        // Network and timeout errors are retryable
        return message.includes('timeout') ||
               message.includes('connection') ||
               message.includes('network') ||
               message.includes('disconnected') ||
               message.includes('protocol error') ||
               message.includes('target closed') ||
               message.includes('navigation failed') ||
               message.includes('net::');
    }

    /**
     * Calculate exponential backoff delay with jitter
     */
    calculateDelay(attempt, baseDelay) {
        // Exponential backoff: baseDelay * 2^(attempt-1) + random jitter
        const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);
        const jitter = Math.random() * 1000; // Add up to 1 second of random jitter
        return Math.min(exponentialDelay + jitter, 30000); // Cap at 30 seconds
    }

    /**
     * Sleep for specified milliseconds
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
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
     * Add essential stealth measures to avoid detection
     */
    async addStealthScript(page) {
        await page.addInitScript(() => {
            // Remove webdriver property - most important detection method
            delete navigator.webdriver;
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined,
            });
            
            // Hide automation indicators
            if (window.chrome && window.chrome.runtime && window.chrome.runtime.onConnect) {
                delete window.chrome.runtime.onConnect;
            }
            
            // Override plugins to look more realistic
            Object.defineProperty(navigator, 'plugins', {
                get: () => [
                    { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
                    { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' }
                ],
            });
            
            // Consistent language settings
            Object.defineProperty(navigator, 'languages', {
                get: () => ['en-US', 'en'],
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
                    this.recordError(relativePath, 'selector_not_found', `Selector "${recipe.selector}" not found, used body fallback`, recipe.url);
                }
                
                return true;
            } else {
                console.log('Failed to convert to markdown');
                this.recordError(relativePath, 'markdown_conversion_error', 'Failed to convert HTML to markdown', recipe.url);
                return false;
            }
        } catch (error) {
            this.recordError(relativePath, 'file_save_error', `Failed to save files: ${error.message}`, recipe.url);
            return false;
        }
    }

    /**
     * Record an error that occurred during processing
     */
    recordError(recipePath, errorType, message, recipeUrl = null) {
        this.errors.push({
            recipe: recipePath,
            type: errorType,
            message: message,
            url: recipeUrl,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Record a skipped recipe (not an error)
     */
    recordSkipped(recipePath, reason, recipeUrl = null) {
        this.skipped.push({
            recipe: recipePath,
            reason: reason,
            url: recipeUrl,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Write error report to report.md file
     */
    async writeErrorReport() {
        const reportPath = 'report.md';
        
        try {
            let report;
            if (this.errors.length === 0) {
                return;
            }

            report = '| Provider | Recipe | Error |\n';
            report += '|----------|--------|-------|\n';

            this.errors.forEach(error => {
                // Extract provider from recipe path (e.g., "stripe/privacy.json" -> "stripe")
                const provider = error.recipe.split('/')[0] || 'unknown';

                // Extract filename only (e.g., "stripe/privacy.json" -> "privacy.json")
                const filename = error.recipe.split('/').pop() || error.recipe;

                // Create link using recipe URL if available, otherwise just the filename
                const recipeLink = error.url ? `[${filename}](${error.url})` : filename;

                // Escape pipe characters in error message
                const escapedMessage = error.message.replace(/\|/g, '\\|');

                report += `| ${provider} | ${recipeLink} | ${escapedMessage} |\n`;
            });

            fs.writeFileSync(reportPath, report);
            console.log(`📊 Error report written to: ${reportPath}`);
            
            if (this.errors.length > 0) {
                console.log(`⚠️  ${this.errors.length} error(s) occurred during processing. See report.md for details.`);
            } else {
                console.log('✅ No errors occurred during processing.');
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
        saveHtml: false,
        concurrency: 3
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
            case '--concurrency':
                if (i + 1 < args.length) {
                    const concurrency = parseInt(args[++i]);
                    if (concurrency > 0 && concurrency <= 10) {
                        config.concurrency = concurrency;
                    } else {
                        console.error('Error: concurrency must be between 1 and 10');
                        process.exit(1);
                    }
                }
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
    console.log('Usage: node fetch-recipes.js [--recipes <path> [<path2> ...]] [--output <dir>] [--clean] [--html] [--concurrency <n>]');
    console.log('  --recipes <path>     Recipe file(s) or directory(ies) (default: ./recipes)');
    console.log('                       Can specify multiple paths separated by spaces');
    console.log('  --output <dir>       Output directory (default: ./agreements)');
    console.log('  --clean              Clean corresponding output files before processing');
    console.log('                       - Removes .md and .html files for specified recipes');
    console.log('                       - Removes empty directories after file deletion');
    console.log('                       - Useful when recipes are disabled to clean up old output');
    console.log('  --html               Save cleaned HTML files in addition to Markdown files');
    console.log('  --concurrency <n>    Number of parallel workers (default: 3, max: 10)');
    console.log('');
    console.log('Examples:');
    console.log('  node fetch-recipes.js --recipes recipes/facebook/privacy.json --clean');
    console.log('  node fetch-recipes.js --recipes recipes/verizon/ --clean');
    console.log('  node fetch-recipes.js --recipes recipes/facebook/ recipes/google/ recipes/apple.json');
    console.log('  node fetch-recipes.js --clean --concurrency 5');
    console.log('  node fetch-recipes.js --recipes recipes/ --concurrency 1');
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

    const fetcher = new RecipeFetcher(config.recipesDir, config.outputDir, config.saveHtml, config.concurrency);
    
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