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

Generate commit messages using Claude API with structured output and rate limiting.

Usage:
  generate-commit-messages.js
  generate-commit-messages.js --help

Behavior:
  - Processes each context file individually with rate limit monitoring
  - Uses structured output API for reliable message parsing
  - Stops at 75% of rate limit (22,500 tokens) to avoid API limits
  - Tracks actual token usage from API responses

Output:
  - GitHub Actions output with commit messages
  - Format: "full/file/path:commit message" per line

Environment Variables:
  ANTHROPIC_API_KEY     - Required. API key for Claude access
  GITHUB_OUTPUT         - GitHub Actions output file

API Configuration:
  - Model: claude-sonnet-4-5
  - Uses structured output with generate_commit_messages tool
  - Rate limit: 75% of 30,000 tokens/minute (22,500 tokens)
  - Individual file processing with token tracking
`);
}

// Rate limit: 75% of 30,000 tokens = 22,500 tokens per session
const RATE_LIMIT_THRESHOLD = 22500;
let totalTokensUsed = 0;

/**
 * Estimate token count (rough approximation: 1 token ≈ 4 characters)
 */
function estimateTokens(text) {
  return Math.ceil(text.length / 4);
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
    
    // Process each file individually
    const results = [];
    
    for (let i = 0; i < contextData.length; i++) {
      const contextFile = contextData[i];
      console.log(`\n🔄 Processing file ${i + 1}/${contextData.length}: ${contextFile.file}`);
      
      // Generate prompt for this single file
      const prompt = generatePrompt([contextFile]);
      const tokenEstimate = estimateTokens(prompt);
      
      // Check if this would exceed 75% rate limit
      // if (totalTokensUsed + tokenEstimate > RATE_LIMIT_THRESHOLD) {
      //   console.log(`⏭️ Stopping at ${totalTokensUsed}/${RATE_LIMIT_THRESHOLD} tokens (75% limit) - skipping remaining ${contextData.length - i} files`);
      //   break;
      // }
      
      console.log(`📊 Estimated tokens: ${tokenEstimate}`);
      
      // Make API call
      console.log('🤖 Making API call to Anthropic...');
      const response = await callAnthropicAPI(apiKey, prompt);
      
      // Track actual tokens used from API response
      if (response._actualInputTokens) {
        totalTokensUsed += response._actualInputTokens;
        console.log(`📊 Running total: ${totalTokensUsed}/${RATE_LIMIT_THRESHOLD} tokens (${Math.round(totalTokensUsed/RATE_LIMIT_THRESHOLD*100)}%)`);
      } else {
        // Fallback to estimate if API doesn't return usage
        totalTokensUsed += tokenEstimate;
        console.log(`📊 Running total (estimated): ${totalTokensUsed}/${RATE_LIMIT_THRESHOLD} tokens`);
      }
      
      // Process response
      const claudeOutput = extractCommitMessages(response);
      if (claudeOutput) {
        results.push(claudeOutput);
        // console.log(`✅ Generated: ${claudeOutput}`);
      }
      
      // Check if we've exceeded 75% limit after this call
      if (totalTokensUsed >= RATE_LIMIT_THRESHOLD) {
        console.log(`⏹️ Reached 75% rate limit - stopping after processing ${i + 1} files`);
        break;
      }
    }
    
    // Combine all results
    const finalOutput = results.join('\n');
    
    if (finalOutput) {
      console.log('\n✅ Final Claude generated commit messages:');
      console.log(finalOutput);
      setGitHubOutput('claude_output', finalOutput);
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
  const files = contextData.map(({ content }) => {
    const match = content.match(/^File: (.+)$/m);
    const filePath = match ? match[1] : 'unknown_file';
    return { path: filePath, content };
  });

  return `Generate commit messages for these agreement files:

${files.map(f => `=== ${f.path} ===\n${f.content}`).join('\n\n')}

Use the generate_commit_messages tool with:
- file_path: exact path shown above  
- commit_message: ➕ for new files, 📄 for updates, max 50 chars`;
}

/**
 * Call Anthropic API using Playwright's request context
 */
async function callAnthropicAPI(apiKey, prompt) {
  const { chromium } = require('playwright');
  
  const payload = {
    model: 'claude-sonnet-4-5',
    max_tokens: 1000,
    tool_choice: {
      type: "tool",
      name: "generate_commit_messages"
    },
    tools: [{
      name: "generate_commit_messages",
      description: "Generate commit messages for agreement files",
      input_schema: {
        type: "object",
        properties: {
          commit_messages: {
            type: "array",
            items: {
              type: "object",
              properties: {
                file_path: {
                  type: "string",
                  description: "Full path to the agreement file"
                },
                commit_message: {
                  type: "string",
                  description: "Commit message starting with ➕ for new or 📄 for updates, max 50 chars"
                }
              },
              required: ["file_path", "commit_message"]
            }
          }
        },
        required: ["commit_messages"]
      }
    }],
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
 * Extract commit messages from Claude structured response
 */
function extractCommitMessages(response) {
  // Primary: Structured output from tool use
  if (response.content?.[0]?.type === 'tool_use' && 
      response.content[0].name === 'generate_commit_messages') {
    const messages = response.content[0].input.commit_messages;
    return messages.map(item => `${item.file_path}:${item.commit_message}`).join('\n');
  }
  
  // Fallback: Text content
  const textContent = response.content?.[0]?.text || response.text || '';
  return textContent.trim() || null;
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