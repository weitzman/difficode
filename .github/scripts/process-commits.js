#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');

/**
 * Display help information
 */
function showHelp() {
  console.log(`
Process Commits Script
======================

Process agreement files and create commits with Claude-generated or fallback messages.

Usage:
  process-commits.js [claude-output]
  process-commits.js --help

Arguments:
  claude-output    Optional. The output from Claude API containing commit messages.
                   Format should be: "filename:commit message" per line.
                   If not provided, fallback messages will be used.

Options:
  --help, -h      Show this help message

Examples:
  # With Claude output
  process-commits.js "claude_context_openai_terms:➕ Add OpenAI Terms tracking"
  
  # Without Claude output (uses fallbacks)
  process-commits.js ""
  
  # Show help
  process-commits.js --help

Environment:
  - Expects /tmp/files_to_commit.txt with list of context files to process
  - Uses git commands to stage and commit changes
  - Cleans up temporary files after processing

Exit codes:
  0 - Success
  1 - Error occurred
`);
}

/**
 * Process commits with Claude-generated messages
 */
async function main() {
  try {
    // Check for help flag
    if (process.argv.includes('--help') || process.argv.includes('-h')) {
      showHelp();
      process.exit(0);
    }

    console.log('🚀 Processing commits with Claude-generated messages...');
    
    // Check if context files exist
    const filesListPath = '/tmp/files_to_commit.txt';
    if (!await fileExists(filesListPath)) {
      console.log('ℹ️ No agreement files to commit');
      process.exit(0);
    }

    const filesList = await fs.readFile(filesListPath, 'utf8');
    if (!filesList.trim()) {
      console.log('ℹ️ Context files list is empty');
      process.exit(0);
    }

    // Get Claude's response from command line argument
    const claudeOutput = process.argv[2] || '';
    
    if (!claudeOutput.trim()) {
      console.log('⚠️ No Claude output provided, will use fallback commit messages');
    } else {
      console.log('🤖 Using Claude-generated commit messages');
    }

    // Process each context file
    const contextFiles = filesList.trim().split('\n').filter(f => f.trim());
    const results = {
      processed: 0,
      committed: 0,
      skipped: 0,
      errors: 0
    };

    for (const contextFile of contextFiles) {
      const trimmedFile = contextFile.trim();
      if (trimmedFile && trimmedFile.startsWith('/tmp/claude_context_')) {
        try {
          const result = await processContextFile(trimmedFile, claudeOutput);
          results.processed++;
          if (result.committed) results.committed++;
          if (result.skipped) results.skipped++;
        } catch (error) {
          console.error(`❌ Error processing ${trimmedFile}: ${error.message}`);
          results.errors++;
        }
      }
    }

    // Clean up temp files
    await cleanupTempFiles(contextFiles);
    
    console.log(`✅ Commit processing complete:`);
    console.log(`   📄 Processed: ${results.processed}`);
    console.log(`   ✅ Committed: ${results.committed}`);
    console.log(`   ⏭️ Skipped: ${results.skipped}`);
    console.log(`   ❌ Errors: ${results.errors}`);

  } catch (error) {
    console.error('❌ Error in commit processing:', error.message);
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
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
 * Process a single context file
 */
async function processContextFile(contextFile, claudeOutput) {
  console.log(`📝 Processing context file: ${contextFile}`);
  
  // Extract provider and filename from context file name
  // Expected format: /tmp/claude_context_provider_filename.txt
  const match = contextFile.match(/claude_context_([^_]+)_(.+)\.txt$/);
  if (!match) {
    console.warn(`⚠️ Unexpected context file format: ${contextFile}`);
    return { committed: false, skipped: true };
  }
  
  const [, provider, filename] = match;
  
  console.log(`   📋 Provider: ${provider}, Filename: ${filename}`);
  
  // Find the corresponding agreement file
  const agreementFile = `agreements/${provider}/${filename}.md`;
  
  // Look for Claude's message for this file
  let commitMsg = '';
  if (claudeOutput.trim()) {
    const lines = claudeOutput.split('\n');
    for (const line of lines) {
      if (line.startsWith(`${agreementFile}:`)) {
        commitMsg = line.split(':').slice(1).join(':').trim();
        console.log(`🤖 Found Claude message for ${agreementFile}: "${commitMsg}"`);
        break;
      }
    }
  }
  
  // Use fallback if no Claude message
  if (!commitMsg) {
    commitMsg = `📄 Update ${provider} ${filename} agreement`;
    console.log(`⚠️ No Claude message found for ${basename}, using fallback: "${commitMsg}"`);
  }
  
  if (await fileExists(agreementFile)) {
    console.log(`📁 Staging file: ${agreementFile}`);
    
    try {
      execSync(`git add "${agreementFile}"`);
      
      // Check if there are actually changes to commit
      if (hasGitStagedChanges()) {
        try {
          // Create commit with proper escaping
          const escapedMsg = commitMsg.replace(/"/g, '\\"');
          execSync(`git commit -m "${escapedMsg}"`, { stdio: 'pipe' });
          console.log(`✅ Committed: ${commitMsg}`);
          
          return { committed: true, skipped: false };
          
        } catch (error) {
          console.error(`❌ Failed to commit for ${basename}: ${error.message}`);
          return { committed: false, skipped: false };
        }
      } else {
        console.log(`ℹ️ No changes to commit for ${agreementFile}`);
        return { committed: false, skipped: true };
      }
    } catch (error) {
      console.error(`❌ Failed to stage ${agreementFile}: ${error.message}`);
      return { committed: false, skipped: false };
    }
  } else {
    console.warn(`⚠️ Agreement file not found: ${agreementFile}`);
    return { committed: false, skipped: true };
  }
}

/**
 * Check if there are staged changes in git
 */
function hasGitStagedChanges() {
  try {
    execSync('git diff --staged --quiet');
    return false; // No changes staged
  } catch {
    return true; // Changes are staged
  }
}

/**
 * Clean up temporary files
 */
async function cleanupTempFiles(contextFiles) {
  console.log('🧹 Cleaning up temporary files...');
  
  // Clean up context files
  for (const contextFile of contextFiles) {
    const trimmedFile = contextFile.trim();
    if (trimmedFile) {
      try {
        await fs.unlink(trimmedFile);
        console.log(`🗑️ Cleaned up: ${trimmedFile}`);
      } catch (error) {
        console.warn(`⚠️ Failed to clean up ${trimmedFile}: ${error.message}`);
      }
    }
  }
  
  // Clean up files list
  try {
    await fs.unlink('/tmp/files_to_commit.txt');
    console.log('🗑️ Cleaned up: /tmp/files_to_commit.txt');
  } catch (error) {
    console.warn('⚠️ Failed to clean up files list:', error.message);
  }
}

// Main execution
main().catch(error => {
  console.error('❌ Unhandled error:', error);
  process.exit(1);
});