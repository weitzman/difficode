#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');

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
 * Generate commit message using Claude API
 */
async function generateCommitMessage(agreementPath) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log('⚠️ ANTHROPIC_API_KEY not set, using fallback message');
    return null;
  }

  try {
    // Get file content and diff
    const fileContent = await getFileContent(agreementPath);
    const diffOutput = await getFileDiff(agreementPath);
    
    const prompt = `Generate commit message for this agreement file:

=== ${agreementPath} ===
File: ${agreementPath}
Provider: ${path.dirname(agreementPath).split('/')[1]}
Document Type: ${path.basename(agreementPath, '.md')}

=== CURRENT FILE CONTENT ===
${fileContent}

=== GIT DIFF ===
${diffOutput}

Use the generate_commit_messages tool with:
- file_path: ${agreementPath}
- commit_message: ➕ for new files, 📄 for updates, max 50 chars`;

    const tokenEstimate = estimateTokens(prompt);
    if (totalTokensUsed + tokenEstimate > RATE_LIMIT_THRESHOLD) {
      console.log(`⏭️ Skipping Claude API call - would exceed rate limit`);
      return null;
    }

    console.log(`🤖 Calling Claude API (${tokenEstimate} tokens estimated)...`);
    const response = await callAnthropicAPI(apiKey, prompt);
    
    // Track actual tokens used
    if (response._actualInputTokens) {
      totalTokensUsed += response._actualInputTokens;
      console.log(`📊 Used ${response._actualInputTokens} tokens (total: ${totalTokensUsed}/${RATE_LIMIT_THRESHOLD})`);
    } else {
      totalTokensUsed += tokenEstimate;
    }

    // Extract message from structured response
    if (response.content?.[0]?.type === 'tool_use' && 
        response.content[0].name === 'generate_commit_messages') {
      const messages = response.content[0].input.commit_messages;
      return messages[0]?.commit_message || null;
    }
    
    // Fallback to text content
    const textContent = response.content?.[0]?.text || response.text || '';
    const match = textContent.match(new RegExp(`${agreementPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:(.+)`));
    return match ? match[1].trim() : null;
    
  } catch (error) {
    console.error(`❌ Claude API error: ${error.message}`);
    return null;
  }
}

/**
 * Call Anthropic API with structured output
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
    const response = await context.request.post('https://api.anthropic.com/v1/messages', {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      data: payload
    });

    if (!response.ok()) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status()}: ${errorText}`);
    }

    const responseData = await response.json();
    
    // Extract actual token usage
    if (responseData.usage && responseData.usage.input_tokens) {
      responseData._actualInputTokens = responseData.usage.input_tokens;
    }
    
    return responseData;
    
  } finally {
    await browser.close();
  }
}

/**
 * Get git diff for a file
 */
async function getFileDiff(file) {
  try {
    const stdout = execSync(`git diff --cached -- "${file}" || echo "New file"`, { encoding: 'utf8' });
    return stdout;
  } catch (error) {
    return "New file";
  }
}

/**
 * Get file content with character limit
 */
async function getFileContent(file) {
  try {
    const content = await fs.readFile(file, 'utf8');
    const maxChars = 20000; // 20KB limit for token management
    
    if (content.length > maxChars) {
      console.log(`📏 Truncating ${file} (${content.length} → ${maxChars} chars)`);
      return content.substring(0, maxChars) + `\n\n[... truncated to prevent token limit issues]`;
    }
    
    return content;
  } catch (error) {
    return `[Error reading file: ${error.message}]`;
  }
}

/**
 * Generate fallback commit message
 */
function generateFallbackMessage(agreementPath) {
  const pathParts = agreementPath.split('/');
  const provider = pathParts[1] || 'unknown';
  const filename = path.basename(agreementPath, '.md');
  
  // Check if file is new or updated
  try {
    execSync(`git diff --cached --quiet -- "${agreementPath}"`);
    return `📄 Update ${provider} ${filename} agreement`;
  } catch {
    return `➕ Add ${provider} ${filename} agreement`;
  }
}

/**
 * Main function
 */
async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(`
Commit Agreement Script
=======================

Stage, generate commit message, and commit a single agreement file.

Usage:
  commit-agreement.js <agreement-path>

Arguments:
  agreement-path    Path to agreement file (e.g., agreements/dropbox/privacy.md)

Environment Variables:
  ANTHROPIC_API_KEY    Optional. For Claude-generated commit messages
`);
    process.exit(0);
  }

  const agreementPath = process.argv[2];
  if (!agreementPath) {
    console.error('❌ Error: Agreement path is required');
    process.exit(1);
  }

  if (!(await fileExists(agreementPath))) {
    console.error(`❌ Error: File not found: ${agreementPath}`);
    process.exit(1);
  }

  try {
    console.log(`📝 Processing: ${agreementPath}`);
    
    // Stage the file
    execSync(`git add "${agreementPath}"`);
    
    // Check if there are actually changes to commit
    try {
      execSync('git diff --staged --quiet');
      console.log(`ℹ️ No changes to commit for ${agreementPath}`);
      return;
    } catch {
      // Changes are staged, continue
    }
    
    // Generate commit message
    let commitMsg = await generateCommitMessage(agreementPath);
    
    if (!commitMsg) {
      commitMsg = generateFallbackMessage(agreementPath);
      console.log(`⚠️ Using fallback message: "${commitMsg}"`);
    } else {
      console.log(`🤖 Using Claude message: "${commitMsg}"`);
    }
    
    // Create commit
    const escapedMsg = commitMsg.replace(/"/g, '\\"');
    execSync(`git commit -m "${escapedMsg}"`, { stdio: 'pipe' });
    console.log(`✅ Committed: ${commitMsg}`);
    
  } catch (error) {
    console.error(`❌ Failed to process ${agreementPath}: ${error.message}`);
    process.exit(1);
  }
}

// Run the script
main().catch(error => {
  console.error('❌ Unhandled error:', error.message);
  process.exit(1);
});