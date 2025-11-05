#!/usr/bin/env node

const fs = require('fs');
const { JSDOM } = require('jsdom');
const TurndownService = require('turndown');

// Default TurndownService configuration
const TURNDOWN_CONFIG = {
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    fence: '```',
    emDelimiter: '*',
    strongDelimiter: '**',
    linkStyle: 'inlined'
};

/**
 * Create a TurndownService with custom rules applied
 */
function createTurndownService(rules) {
    const turndown = new TurndownService(TURNDOWN_CONFIG);
    
    if (rules?.length) {
        rules.forEach(rule => {
            if (rule.name && rule.filter && rule.replacement !== undefined) {
                turndown.addRule(rule.name, {
                    filter: rule.filter,
                    replacement: () => rule.replacement
                });
            }
        });
    }
    
    return turndown;
}

/**
 * Find elements in document using selector with fallback
 */
function findElements(document, selector) {
    if (!selector) {
        return { elements: [document.querySelector('body')], selectorFound: true };
    }
    
    const elements = document.querySelectorAll(selector);
    
    if (elements.length === 0) {
        console.error(`❌ Selector "${selector}" not found, falling back to body`);
        return { elements: [document.querySelector('body')], selectorFound: false };
    }
    
    return { elements: Array.from(elements), selectorFound: true };
}

/**
 * Convert elements to markdown and combine
 */
function elementsToMarkdown(elements, turndown) {
    return elements
        .map(element => element ? turndown.turndown(element) : '')
        .filter(markdown => markdown.trim())
        .join('\n\n');
}

/**
 * Generate markdown header with metadata
 */
function generateHeader(url, selector) {
    const header = `# Content from: ${url}\n\n`;
    const selectorInfo = selector ? `Selector used: ${selector}\n` : '';
    const separator = `\n---\n\n`;
    
    return header + selectorInfo + separator;
}

/**
 * Convert HTML to Markdown with optional CSS selector and rules
 */
function convertToMarkdown(html, url, selector, rules) {
    try {
        const dom = new JSDOM(html);
        const document = dom.window.document;
        
        const result = findElements(document, selector);
        
        if (!result?.elements?.length || !result.elements[0]) {
            console.error('No content found');
            return { markdown: null, selectorFound: false };
        }
        
        const turndown = createTurndownService(rules);
        const markdown = elementsToMarkdown(result.elements, turndown);
        
        return {
            markdown: generateHeader(url, selector) + markdown,
            selectorFound: result.selectorFound
        };
        
    } catch (error) {
        console.error('Error converting to markdown:', error.message);
        return { markdown: null, selectorFound: false };
    }
}

/**
 * Parse command line arguments and execute conversion
 */
function main() {
    const args = process.argv.slice(2);
    
    if (args.length < 3) {
        console.error('Usage: node convert-html.js <html-file> <output-file> <selector> [url] [rules-json]');
        process.exit(1);
    }
    
    const [htmlFile, outputFile, selector, url = 'Unknown', rulesJson] = args;
    
    let rules = null;
    if (rulesJson) {
        try {
            rules = JSON.parse(rulesJson);
        } catch (error) {
            console.error('Invalid rules JSON:', error.message);
            process.exit(1);
        }
    }
    
    try {
        const html = fs.readFileSync(htmlFile, 'utf8');
        const result = convertToMarkdown(html, url, selector, rules);
        
        if (!result.markdown) {
            console.error('Failed to convert HTML to markdown');
            process.exit(1);
        }
        
        fs.writeFileSync(outputFile, result.markdown);
        console.log(`Converted ${htmlFile} to ${outputFile} using selector: ${selector}`);
        
        if (!result.selectorFound) {
            console.warn(`⚠️  Selector "${selector}" was not found, used body fallback`);
        }
        
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

// Run CLI if called directly
if (require.main === module) {
    main();
}

module.exports = { convertToMarkdown };