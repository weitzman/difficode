#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * CLI script to generate a markdown table of all recipes
 * 
 * Usage: node list-recipes.js
 * 
 * Outputs a markdown table with columns:
 * - Provider: Directory name
 * - Source: Recipe filename linked to URL
 * - Latest: Link to agreement file on main branch
 * - Revisions: Link to commit history for agreement file
 */

class RecipeTableGenerator {
    constructor() {
        this.recipesDir = 'recipes';
        this.githubRepo = 'https://github.com/weitzman/difficode';
        this.recipes = [];
    }

    /**
     * Scan recipes directory and collect all recipe files
     */
    scanRecipes() {
        if (!fs.existsSync(this.recipesDir)) {
            console.error(`Error: Recipes directory '${this.recipesDir}' not found`);
            process.exit(1);
        }

        const providers = fs.readdirSync(this.recipesDir, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);

        for (const provider of providers) {
            const providerDir = path.join(this.recipesDir, provider);
            const recipeFiles = fs.readdirSync(providerDir)
                .filter(file => file.endsWith('.json'));

            for (const recipeFile of recipeFiles) {
                const recipePath = path.join(providerDir, recipeFile);
                
                try {
                    const recipeContent = JSON.parse(fs.readFileSync(recipePath, 'utf8'));
                    
                    if (recipeContent.url && recipeContent.enabled) {
                        this.recipes.push({
                            provider: provider,
                            filename: recipeFile,
                            url: recipeContent.url,
                            agreementPath: this.getAgreementPath(provider, recipeFile)
                        });
                    }
                } catch (error) {
                    console.error(`Warning: Failed to parse ${recipePath}: ${error.message}`);
                }
            }
        }
    }

    /**
     * Generate the expected agreement file path based on provider and recipe filename
     */
    getAgreementPath(provider, recipeFile) {
        const basename = path.basename(recipeFile, '.json');
        return `agreements/${provider}/${basename}.md`;
    }

    /**
     * Convert filename to initial case and remove .json suffix
     */
    formatSourceName(filename) {
        const basename = path.basename(filename, '.json');
        // Convert to initial case (capitalize first letter of each word)
        return basename.split(/[-_]/).map(word => 
            word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        ).join(' ');
    }

    /**
     * Convert provider name to initial case
     */
    formatProviderName(provider) {
        // Convert to initial case (capitalize first letter of each word)
        return provider.split(/[-_]/).map(word => 
            word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        ).join(' ');
    }

    /**
     * Generate markdown table
     */
    generateTable() {
        if (this.recipes.length === 0) {
            return 'No enabled recipes found.';
        }

        // Sort recipes by provider, then by filename
        this.recipes.sort((a, b) => {
            if (a.provider !== b.provider) {
                return a.provider.localeCompare(b.provider);
            }
            return a.filename.localeCompare(b.filename);
        });

        let table = '| Provider | Source | Links |\n';
        table += '|----------|--------|-------|\n';

        for (const recipe of this.recipes) {
            const providerName = this.formatProviderName(recipe.provider);
            const sourceName = this.formatSourceName(recipe.filename);
            const sourceLink = `[${sourceName}](${recipe.url})`;
            const latestLink = `[latest](${this.githubRepo}/blob/main/${recipe.agreementPath})`;
            const revisionsLink = `[revisions](${this.githubRepo}/commits/main/${recipe.agreementPath})`;
            const recipeLink = `[recipe](${this.githubRepo}/blob/main/recipes/${recipe.provider}/${recipe.filename})`;
            const linksColumn = `${latestLink} · ${revisionsLink} · ${recipeLink}`;
            
            table += `| ${providerName} | ${sourceLink} | ${linksColumn} |\n`;
        }

        return table;
    }

    /**
     * Run the table generation
     */
    run() {
        this.scanRecipes();
        const table = this.generateTable();
        console.log(table);
    }
}

// Run if called directly
if (require.main === module) {
    const generator = new RecipeTableGenerator();
    generator.run();
}

module.exports = RecipeTableGenerator;