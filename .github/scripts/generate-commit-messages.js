#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');

/**
 * Display help information
 */
function showHelp() {
  console.log(`
Generate Commit Messages Script
===============================

Generate intelligent commit messages using Claude (Anthropic API) for agreement file changes.

Usage:
  generate-commit-messages.js
  generate-commit-messages.js --help

Options:
  --help, -h      Show this help message

Behavior:
  - Reads context files from /tmp/files_to_commit.txt
  - Sends file content and diffs to Claude API
  - Generates specific commit messages for each agreement file
  - Sets GitHub Actions output: claude_output

Input:
  - Context files: /tmp/claude_context_<provider>_<filename>.txt
  - File list: /tmp/files_to_commit.txt

Output:
  - GitHub Actions output with commit messages
  - Format: "filename:commit message" per line

Environment Variables:
  ANTHROPIC_API_KEY     - Required. API key for Claude access
  GITHUB_OUTPUT         - GitHub Actions output file

API Configuration:
  - Model: claude-sonnet-4-5
  - Max tokens: 1000
  - Uses Playwright for HTTP requests

Exit codes:
  0 - Success
  1 - Error occurred
`);
}

/**
 * Generate commit messages using Anthropic API
 */
async function main() {
  try {
    // Check for help flag
    if (process.argv.includes('--help') || process.argv.includes('-h')) {
      showHelp();
      process.exit(0);
    }

    console.log('🚀 Starting Claude commit message generation...');
    
    // Check for required files
    const filesListPath = '/tmp/files_to_commit.txt';
    if (!await fileExists(filesListPath)) {
      console.log('No context files found');
      process.exit(0);
    }

    const filesList = await fs.readFile(filesListPath, 'utf8');
    if (!filesList.trim()) {
      console.log('Context files list is empty');
      process.exit(0);
    }

    // Check API key
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.log('⚠️ ANTHROPIC_API_KEY not set, skipping Claude generation');
      setGitHubOutput('claude_output', '');
      process.exit(0);
    }

    // Collect context data
    console.log('📖 Reading context files...');
    const contextData = await collectContextData(filesList);
    
    // Generate prompt
    const prompt = generatePrompt(contextData);
    
    console.log('=== PROMPT BEING SENT ===');
    console.log(prompt);
    console.log('==========================');

    // Make API call
    console.log('🤖 Making API call to Anthropic...');
    const response = await callAnthropicAPI(apiKey, prompt);
    
    // Process response
    const claudeOutput = extractCommitMessages(response);
    
    if (claudeOutput) {
      console.log('✅ Claude generated commit messages:');
      console.log(claudeOutput);
      setGitHubOutput('claude_output', claudeOutput);
    } else {
      console.log('⚠️ No commit messages generated');
      setGitHubOutput('claude_output', '');
    }

  } catch (error) {
    console.error('❌ Error in commit message generation:', error.message);
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
    setGitHubOutput('claude_output', '');
    process.exit(1);
  }
}

/**
 * Check if file exists
 */
async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Collect context data from all context files
 */
async function collectContextData(filesList) {
  const contextData = [];
  const files = filesList.trim().split('\n').filter(f => f.trim());
  
  for (const contextFile of files) {
    const trimmedFile = contextFile.trim();
    if (trimmedFile && await fileExists(trimmedFile)) {
      console.log(`Reading context from: ${trimmedFile}`);
      try {
        const content = await fs.readFile(trimmedFile, 'utf8');
        contextData.push({
          file: trimmedFile,
          content: content
        });
      } catch (error) {
        console.warn(`⚠️ Failed to read ${trimmedFile}: ${error.message}`);
      }
    }
  }
  
  return contextData;
}

/**
 * Generate the prompt for Claude
 */
function generatePrompt(contextData) {
  let prompt = `I need you to generate commit messages for legal agreement files.

Context files provided:`;

  for (const { file, content } of contextData) {
    prompt += `\n\n=== CONTEXT FILE: ${file} ===\n${content}`;
  }

  prompt += `

For each context file, generate a commit message that:
- Starts with ➕ for new files or 📄 for updates
- Describes the content in under 50 characters
- Uses format: FILENAME:MESSAGE

For example:
claude_context_openai_terms:➕ Add OpenAI Terms of Service tracking
claude_context_openai_privacy:➕ Add OpenAI Privacy Policy tracking

Generate one message per context file:`;

  return prompt;
}

/**
 * Call Anthropic API using Playwright's request context
 */
async function callAnthropicAPI(apiKey, prompt) {
  const { chromium } = require('playwright');
  
  const payload = {
    model: 'claude-sonnet-4-5',
    max_tokens: 1000,
    messages: [{
      role: 'user',
      content: prompt
    }]
  };

  const browser = await chromium.launch();
  const context = await browser.newContext();

  try {
    console.log('🌐 Making API request via Playwright...');
    
    const response = await context.request.post('https://api.anthropic.com/v1/messages', {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      data: payload
    });

    console.log(`HTTP Status Code: ${response.status()}`);
    
    if (!response.ok()) {
      const errorText = await response.text();
      console.log(`❌ API Error (${response.status()}):`);
      console.log(errorText);
      
      // Check for specific error types
      const status = response.status();
      if (status === 401) {
        console.log('🔐 Authentication error - check ANTHROPIC_API_KEY');
      } else if (status === 429) {
        console.log('⏱️ Rate limit error - API usage exceeded');
      } else if (status === 404) {
        console.log('🤖 Model not found - check model name');
      } else if (status >= 500) {
        console.log('🔥 Server error - try again later');
      }
      
      throw new Error(`HTTP ${status}: ${errorText}`);
    }

    const responseData = await response.json();
    
    console.log('=== RAW API RESPONSE ===');
    console.log(JSON.stringify(responseData, null, 2));
    console.log('========================');
    
    return responseData;
    
  } catch (error) {
    if (error.message?.includes('net::ERR_NAME_NOT_RESOLVED')) {
      console.log('🌐 Network error - check internet connection');
    } else if (error.message?.includes('Failed to parse')) {
      console.log('📝 JSON parse error - invalid API response');
    }
    throw error;
  } finally {
    await browser.close();
  }
}

/**
 * Extract commit messages from Claude response
 */
function extractCommitMessages(response) {
  console.log('🔍 Extracting commit messages from response...');
  
  // Try different response format paths
  const formats = [
    { path: 'content[0].text', desc: 'Standard Anthropic format' },
    { path: 'choices[0].message.content', desc: 'OpenAI-style format' },
    { path: 'message.content', desc: 'Alternative format' },
    { path: 'text', desc: 'Direct text format' }
  ];
  
  for (const format of formats) {
    try {
      const content = getNestedProperty(response, format.path);
      if (content && typeof content === 'string' && content.trim()) {
        console.log(`✅ Found content using ${format.desc} (${format.path})`);
        return content.trim();
      }
    } catch (error) {
      console.log(`⚠️ Failed to extract using ${format.path}: ${error.message}`);
    }
  }
  
  console.log('⚠️ No recognized response format found');
  console.log('Available keys:', Object.keys(response));
  
  // If it's a simple object with a text property, try that
  if (response && typeof response === 'object') {
    const keys = Object.keys(response);
    console.log('Response structure:');
    for (const key of keys) {
      const value = response[key];
      const type = Array.isArray(value) ? 'array' : typeof value;
      const preview = typeof value === 'string' ? value.substring(0, 50) + '...' : '';
      console.log(`  ${key}: ${type} ${preview}`);
    }
  }
  
  return null;
}

/**
 * Get nested property from object using dot notation
 */
function getNestedProperty(obj, path) {
  return path.split(/[\.\[\]]+/).filter(Boolean).reduce((current, key) => {
    return current && current[key] !== undefined ? current[key] : undefined;
  }, obj);
}

/**
 * Set GitHub Actions output
 */
function setGitHubOutput(name, value) {
  const githubOutput = process.env.GITHUB_OUTPUT;
  if (githubOutput) {
    const outputContent = `${name}<<EOF\n${value}\nEOF\n`;
    require('fs').appendFileSync(githubOutput, outputContent);
  } else {
    console.log(`Would set output ${name}=${value}`);
  }
}

// Main execution
main().catch(error => {
  console.error('❌ Unhandled error:', error);
  process.exit(1);
});