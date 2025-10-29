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
        '--disable-features=VizDisplayCompositor'
    ]
};

const CONTEXT_CONFIG = {
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 720 },
    locale: 'en-US',
    timezoneId: 'America/New_York',
    extraHTTPHeaders: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
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
    constructor(recipesDir = './recipes', outputDir = './output') {
        this.recipesDir = recipesDir;
        this.outputDir = outputDir;
    }

    /**
     * Clean output directory or subdirectory
     */
    cleanOutput(targetDir = null) {
        const cleanDir = targetDir || this.outputDir;
        
        if (fs.existsSync(cleanDir)) {
            console.log(`🧹 Cleaning directory: ${cleanDir}`);
            fs.rmSync(cleanDir, { recursive: true, force: true });
            console.log(`✅ Cleaned: ${cleanDir}\n`);
        } else {
            console.log(`📁 Directory doesn't exist: ${cleanDir}\n`);
        }
    }

    /**
     * Main entry point for recipe processing
     */
    async fetchRecipes() {
        console.log('Starting recipe fetching...\n');
        
        if (!fs.existsSync(this.recipesDir)) {
            console.error('Error: recipes path not found');
            return;
        }

        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }

        const jsonFiles = this.getRecipeFiles();
        console.log(`Found ${jsonFiles.length} recipe files\n`);

        for (const filePath of jsonFiles) {
            await this.processRecipe(filePath);
        }

        console.log('Recipe fetching completed!');
    }

    /**
     * Get all recipe JSON files from the recipes directory
     */
    getRecipeFiles() {
        const stat = fs.statSync(this.recipesDir);
        
        if (stat.isFile()) {
            if (path.extname(this.recipesDir) !== '.json') {
                console.error(`Error: ${this.recipesDir} is not a JSON file`);
                return [];
            }
            return [this.recipesDir];
        }
        
        if (stat.isDirectory()) {
            return this.findJsonFiles(this.recipesDir);
        }
        
        console.error(`Error: ${this.recipesDir} is neither a file nor a directory`);
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

        try {
            const recipe = this.loadRecipe(filePath);
            
            if (!this.validateRecipe(recipe)) {
                return;
            }

            console.log(`URL: ${recipe.url}`);
            console.log(`Selector: ${recipe.selector}`);

            const html = await this.fetchUrl(recipe.url);
            if (!html) {
                console.log('Failed to fetch HTML, skipping\n');
                return;
            }

            const outputPath = PathUtils.getOutputPath(relativePath, this.outputDir);
            await this.saveFiles(outputPath, html, recipe);
            
            console.log('✅ Success\n');

        } catch (error) {
            console.error(`Error processing ${relativePath}: ${error.message}\n`);
        }
    }

    /**
     * Load and parse recipe with defaults
     */
    loadRecipe(filePath) {
        const content = fs.readFileSync(filePath, 'utf8');
        const recipe = JSON.parse(content);
        recipe.enabled = recipe.enabled !== undefined ? recipe.enabled : 1;
        return recipe;
    }

    /**
     * Validate recipe has required fields
     */
    validateRecipe(recipe) {
        if (!recipe.enabled) {
            console.log('Recipe disabled, skipping\n');
            return false;
        }

        if (!recipe.url || !recipe.selector) {
            console.log('Missing required fields (url, selector), skipping\n');
            return false;
        }

        return true;
    }

    /**
     * Fetch URL content using Playwright
     */
    async fetchUrl(url) {
        let browser;
        try {
            console.log('Launching browser...');
            browser = await chromium.launch(BROWSER_CONFIG);
            const context = await browser.newContext(CONTEXT_CONFIG);
            const page = await context.newPage();
            
            // Add stealth measures
            await this.addStealthScript(page);
            
            console.log('Navigating to URL...');
            await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
            await page.waitForTimeout(3000); // Wait for dynamic content
            
            console.log('Getting page content...');
            return await page.content();
            
        } catch (error) {
            throw new Error(`Playwright fetch failed: ${error.message}`);
        } finally {
            if (browser) {
                await browser.close();
            }
        }
    }

    /**
     * Add stealth measures to avoid detection
     */
    async addStealthScript(page) {
        await page.addInitScript(() => {
            delete navigator.webdriver;
            Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
            Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
        });
    }

    /**
     * Save HTML and markdown files
     */
    async saveFiles(outputPath, html, recipe) {
        if (!fs.existsSync(outputPath.dir)) {
            fs.mkdirSync(outputPath.dir, { recursive: true });
        }

        // Save raw HTML
        const htmlFile = path.join(outputPath.dir, `${outputPath.name}.html`);
        fs.writeFileSync(htmlFile, html);
        console.log(`Saved: ${htmlFile}`);

        // Convert and save markdown
        const markdownFile = path.join(outputPath.dir, `${outputPath.name}.md`);
        const markdown = convertToMarkdown(html, recipe.url, recipe.selector, recipe.rules);
        
        if (markdown) {
            fs.writeFileSync(markdownFile, markdown);
            console.log(`Saved: ${markdownFile}`);
        } else {
            console.log('Failed to convert to markdown');
        }
    }
}

/**
 * Command line argument parser
 */
function parseArgs() {
    const args = process.argv.slice(2);
    const config = {
        recipesDir: './recipes',
        outputDir: './output',
        shouldClean: false,
        showHelp: false
    };

    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '--recipes':
                if (i + 1 < args.length) {
                    config.recipesDir = args[++i];
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
    console.log('Usage: node fetch-recipes.js [--recipes <path>] [--output <dir>] [--clean]');
    console.log('  --recipes <path>  Recipe file or directory (default: ./recipes)');
    console.log('  --output <dir>    Output directory (default: ./output)');
    console.log('  --clean           Clean output directory before processing');
    console.log('                    - With --recipes: cleans specific output subdirectory');
    console.log('                    - Without --recipes: cleans entire output directory');
    console.log('');
    console.log('Examples:');
    console.log('  node fetch-recipes.js --recipes recipes/facebook/privacy.json --clean');
    console.log('  node fetch-recipes.js --recipes recipes/verizon/ --clean');
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

    const fetcher = new RecipeFetcher(config.recipesDir, config.outputDir);
    
    // Handle cleaning if requested
    if (config.shouldClean) {
        const targetDir = config.recipesDir !== './recipes' 
            ? PathUtils.getCleanTarget(config.recipesDir, config.outputDir)
            : null;
        fetcher.cleanOutput(targetDir);
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