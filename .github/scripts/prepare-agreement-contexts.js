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
    // Get changed files based on context (PR vs push)
    const isPullRequest = process.env.GITHUB_EVENT_NAME === 'pull_request';
    
    if (isPullRequest) {
      const baseBranch = process.env.GITHUB_BASE_REF || 'main';
      console.log(`🔀 Pull request mode - comparing with origin/${baseBranch}`);
      
      // Changed files in PR
      const { stdout: changedFiles } = await execAsync(`git diff --name-only "origin/${baseBranch}"...HEAD -- agreements/ || true`);
      addFilesToSet(files, changedFiles);
      
    } else {
      console.log('⚡ Push mode - comparing with HEAD~1');
      
      // Changed files in push
      const { stdout: changedFiles } = await execAsync('git diff --name-only HEAD~1 HEAD -- agreements/ || true');
      addFilesToSet(files, changedFiles);
    }
    
    // Staged files
    const { stdout: stagedFiles } = await execAsync('git diff --staged --name-only agreements/ || true');
    addFilesToSet(files, stagedFiles);
    
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
    execSync(`git add "${file}"`);
    
    // Get diff output
    const diffOutput = await getFileDiff(file);
    
    // Get current file content (limit to avoid token limits)
    const fileContent = await getFileContent(file, 5000);
    
    // Create context file
    const contextFile = `/tmp/claude_context_${provider}_${filename}.txt`;
    const contextContent = `File: ${file}
Provider: ${provider}
Document Type: ${filename}

=== CURRENT FILE CONTENT (first 5000 lines) ===
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
      execSync(`git add "${file}" || git rm "${file}" || true`);
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
    const isPullRequest = process.env.GITHUB_EVENT_NAME === 'pull_request';
    
    if (isPullRequest) {
      const baseBranch = process.env.GITHUB_BASE_REF || 'main';
      const { stdout } = await execAsync(`git diff "origin/${baseBranch}"...HEAD "${file}" || echo "New file"`);
      return stdout || "New file";
    } else {
      const { stdout } = await execAsync(`git diff HEAD~1 "${file}" || git diff --cached "${file}" || echo "New file"`);
      return stdout || "New file";
    }
  } catch (error) {
    console.warn(`⚠️ Failed to get diff for ${file}: ${error.message}`);
    return "New file";
  }
}

/**
 * Get file content with line limit and character limit
 */
async function getFileContent(file, maxLines = 5000) {
  try {
    const content = await fs.readFile(file, 'utf8');
    const lines = content.split('\n');
    
    // Character limit to prevent Claude API prompt length issues (roughly 100KB)
    const maxChars = 100000;
    
    let truncatedContent = content;
    let truncationReason = '';
    
    // First, check character limit
    if (content.length > maxChars) {
      truncatedContent = content.substring(0, maxChars);
      truncationReason = `character limit (${maxChars})`;
    }
    
    // Then check line limit on the potentially character-truncated content
    const truncatedLines = truncatedContent.split('\n');
    if (truncatedLines.length > maxLines) {
      truncatedContent = truncatedLines.slice(0, maxLines).join('\n');
      truncationReason = truncationReason ? 
        `${truncationReason} and line limit (${maxLines})` : 
        `line limit (${maxLines})`;
    }
    
    if (truncationReason) {
      console.log(`📏 Truncating ${file} due to ${truncationReason} (original: ${lines.length} lines, ${content.length} chars)`);
      truncatedContent += `\n\n[... truncated due to ${truncationReason}]`;
    }
    
    return truncatedContent;
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