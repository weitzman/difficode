#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const { execSync, exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

/**
 * Display help information
 */
function showHelp() {
  console.log(`
Prepare Agreement Contexts Script
=================================

Analyze changed agreement files and prepare context files for Claude analysis.

Usage:
  prepare-agreement-contexts.js
  prepare-agreement-contexts.js --help

Options:
  --help, -h      Show this help message

Behavior:
  - Detects changed/new/deleted files in agreements/ directory
  - Compares with base branch for pull requests or HEAD~1 for pushes
  - Creates context files with file content and git diffs
  - Sets GitHub Actions output: has_agreement_changes (true/false)
  - Handles file deletions by committing them immediately

Output:
  - Context files: /tmp/claude_context_<provider>_<filename>.txt
  - File list: /tmp/files_to_commit.txt
  - GitHub Actions output for workflow control

Environment Variables:
  GITHUB_EVENT_NAME     - Determines comparison strategy (pull_request vs push)
  GITHUB_BASE_REF       - Base branch for pull request comparison
  GITHUB_OUTPUT         - GitHub Actions output file

Exit codes:
  0 - Success
  1 - Error occurred
`);
}

/**
 * Prepare context files for Claude analysis of agreement changes
 */
async function main() {
  try {
    // Check for help flag
    if (process.argv.includes('--help') || process.argv.includes('-h')) {
      showHelp();
      process.exit(0);
    }

    console.log('🔍 Analyzing agreement file changes...');
    
    // Configure git for GitHub Actions
    await configureGit();
    
    // Get changed files in agreements directory
    const changedFiles = await getChangedAgreementFiles();
    
    if (changedFiles.length > 0) {
      console.log(`📄 Found ${changedFiles.length} changed files in agreements directory:`);
      changedFiles.forEach(file => console.log(`  - ${file}`));
      
      // Create tracking file
      await fs.writeFile('/tmp/files_to_commit.txt', '');
      
      // Set GitHub Actions output
      setGitHubOutput('has_agreement_changes', 'true');
      
      // Process each file
      const contextFiles = [];
      for (const file of changedFiles) {
        try {
          const contextFile = await processAgreementFile(file);
          if (contextFile) {
            contextFiles.push(contextFile);
          }
        } catch (error) {
          console.warn(`⚠️ Failed to process ${file}: ${error.message}`);
        }
      }
      
      // Write context files list
      await fs.writeFile('/tmp/files_to_commit.txt', contextFiles.join('\n'));
      
      console.log(`✅ Context preparation complete - created ${contextFiles.length} context files`);
      
    } else {
      console.log('ℹ️ No files changed in agreements directory');
      await fs.writeFile('/tmp/files_to_commit.txt', '');
      setGitHubOutput('has_agreement_changes', 'false');
    }
    
  } catch (error) {
    console.error('❌ Error in context preparation:', error.message);
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
    process.exit(1);
  }
}

/**
 * Configure git for GitHub Actions
 */
async function configureGit() {
  try {
    execSync('git config --local user.email "action@github.com"');
    execSync('git config --local user.name "GitHub Action"');
    console.log('⚙️ Git configured for GitHub Actions');
  } catch (error) {
    console.warn('⚠️ Failed to configure git, continuing anyway');
  }
}

/**
 * Get list of changed agreement files
 */
async function getChangedAgreementFiles() {
  const files = new Set();
  
  try {
   // Changed files
   const { stdout: changedFiles } = await execAsync('git diff --name-only -- agreements/ || true');
   addFilesToSet(files, changedFiles);
    
    // Staged files
    // const { stdout: stagedFiles } = await execAsync('git diff --staged --name-only agreements/ || true');
    // addFilesToSet(files, stagedFiles);
    
    // Untracked files
    const { stdout: untrackedFiles } = await execAsync('git ls-files --others --exclude-standard agreements/ || true');
    addFilesToSet(files, untrackedFiles);
    
  } catch (error) {
    console.warn(`⚠️ Error getting changed files: ${error.message}`);
  }
  
  return Array.from(files).filter(file => file.trim().length > 0).sort();
}

/**
 * Add files from command output to set
 */
function addFilesToSet(set, output) {
  if (output?.trim()) {
    output.trim().split('\n').forEach(file => {
      const trimmed = file.trim();
      if (trimmed) {
        set.add(trimmed);
      }
    });
  }
}

/**
 * Process a single agreement file
 */
async function processAgreementFile(file) {
  console.log(`📝 Processing: ${file}`);
  
  // Extract provider and document type from path
  const pathParts = file.split('/');
  const provider = pathParts[1];
  const filename = path.basename(file, '.md');
  
  // Check if file exists (not deleted)
  if (await fileExists(file)) {
    // Stage the file
    execSync(`git add -f "${file}"`);
    
    // Get diff output
    const diffOutput = await getFileDiff(file);
    
    // Get current file content (limited to prevent token issues)
    const fileContent = await getFileContent(file);
    
    // Create context file
    const contextFile = `/tmp/claude_context_${provider}_${filename}.txt`;
    const contextContent = `File: ${file}
Provider: ${provider}
Document Type: ${filename}

=== CURRENT FILE CONTENT ===
${fileContent}

=== GIT DIFF ===
${diffOutput}`;
    
    await fs.writeFile(contextFile, contextContent);
    console.log(`✅ Created context file: ${contextFile}`);
    
    return contextFile;
    
  } else {
    // Handle deleted files
    console.log(`🗑️ Handling deleted file: ${file}`);
    try {
      execSync(`git add -f "${file}" || git rm -f "${file}" || true`);
      execSync(`git commit -m "🗑️ Remove ${provider} ${filename} agreement"`);
      console.log(`✅ Committed deletion of: ${file}`);
    } catch (error) {
      console.warn(`⚠️ Failed to commit deletion of ${file}: ${error.message}`);
    }
    return null;
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
 * Get git diff for a file
 */
async function getFileDiff(file) {
  try {
    const { stdout } = await execAsync(`git diff "${file}" || git diff --cached "${file}" || echo "New file"`);
    console.log(stdout)
    return stdout;
  } catch (error) {
    console.warn(`⚠️ Failed to get diff for ${file}: ${error.message}`);
    return "New file";
  }
}

/**
 * Get file content with character limit to prevent Claude API token limits
 */
async function getFileContent(file) {
  try {
    const content = await fs.readFile(file, 'utf8');
    
    // Character limit to prevent Claude API prompt token issues (roughly 100KB)
    const maxChars = 100000;
    
    if (content.length > maxChars) {
      console.log(`📏 Truncating ${file} due to character limit (original: ${content.length} chars, limit: ${maxChars})`);
      const truncatedContent = content.substring(0, maxChars);
      return truncatedContent + `\n\n[... truncated after ${maxChars} characters to prevent token limit issues]`;
    }
    
    return content;
  } catch (error) {
    console.warn(`⚠️ Failed to read ${file}: ${error.message}`);
    return `[Error reading file: ${error.message}]`;
  }
}

/**
 * Set GitHub Actions output
 */
function setGitHubOutput(name, value) {
  const githubOutput = process.env.GITHUB_OUTPUT;
  if (githubOutput) {
    require('fs').appendFileSync(githubOutput, `${name}=${value}\n`);
    console.log(`📤 Set output: ${name}=${value}`);
  } else {
    console.log(`📤 Would set output: ${name}=${value}`);
  }
}

// Main execution
main().catch(error => {
  console.error('❌ Unhandled error:', error);
  process.exit(1);
});