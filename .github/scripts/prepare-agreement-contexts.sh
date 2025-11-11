#!/bin/bash
# Script to prepare context files for Claude analysis of agreement changes

set -e

# Configure git if not already set (for GitHub Actions)
git config --local user.email "action@github.com"
git config --local user.name "GitHub Action"

# Get list of all changed/new/deleted files in agreements directory
# Use proper base branch comparison for PR context
if [ -n "${GITHUB_EVENT_NAME:-}" ] && [ "$GITHUB_EVENT_NAME" = "pull_request" ]; then
  # For pull requests: compare with the target branch
  BASE_BRANCH="${GITHUB_BASE_REF:-main}"
  echo "Debug: PR mode, comparing against origin/$BASE_BRANCH"
  CHANGED_AGREEMENTS=$(git diff --name-only "origin/$BASE_BRANCH"...HEAD -- agreements/ 2>/dev/null || true)
  STAGED_AGREEMENTS=$(git diff --staged --name-only agreements/ 2>/dev/null || true)
else
  # For push events: compare with previous commit
  echo "Debug: Push mode, comparing against HEAD~1"
  CHANGED_AGREEMENTS=$(git diff --name-only HEAD~1 HEAD -- agreements/ 2>/dev/null || true)
  STAGED_AGREEMENTS=$(git diff --staged --name-only agreements/ 2>/dev/null || true)
fi

echo "Debug: CHANGED_AGREEMENTS='$CHANGED_AGREEMENTS'"
echo "Debug: STAGED_AGREEMENTS='$STAGED_AGREEMENTS'"

# Also check for new untracked files in agreements directory
UNTRACKED_AGREEMENTS=$(git ls-files --others --exclude-standard agreements/ 2>/dev/null || true)
echo "Debug: UNTRACKED_AGREEMENTS='$UNTRACKED_AGREEMENTS'"

# Combine all: changed, staged, and untracked
ALL_CHANGED=$(echo -e "$CHANGED_AGREEMENTS\n$STAGED_AGREEMENTS\n$UNTRACKED_AGREEMENTS" | sort | uniq | grep -v '^$' || true)

echo "Debug: ALL_CHANGED='$ALL_CHANGED'"

if [ -n "$ALL_CHANGED" ]; then
  echo "Found changed files in agreements directory:"
  echo "$ALL_CHANGED"
  
  # Create output file to track what we processed
  > /tmp/files_to_commit.txt
  
  # Set GitHub Actions output to indicate we have files to process
  echo "has_agreement_changes=true" >> $GITHUB_OUTPUT
  
  # Process each file individually (using process substitution to avoid subshell)
  while IFS= read -r file; do
    if [ -n "$file" ]; then
      echo "Processing: $file"
      
      # Extract provider and document type from path
      PROVIDER=$(echo "$file" | cut -d'/' -f2)
      FILENAME=$(basename "$file" .md)
      
      # Check if file exists (not deleted)
      if [ -f "$file" ]; then
        # Stage the file first to get the diff
        git add "$file"
        
        # Get the git diff for this specific file
        if [ -n "${GITHUB_EVENT_NAME:-}" ] && [ "$GITHUB_EVENT_NAME" = "pull_request" ]; then
          # For pull requests: compare with the target branch
          BASE_BRANCH="${GITHUB_BASE_REF:-main}"
          DIFF_OUTPUT=$(git diff "origin/$BASE_BRANCH"...HEAD "$file" 2>/dev/null || echo "New file")
        else
          # For push events: compare with previous commit  
          DIFF_OUTPUT=$(git diff HEAD~1 "$file" 2>/dev/null || git diff --cached "$file" 2>/dev/null || echo "New file")
        fi
        
        # Get the current file content (first 5000 lines to avoid token limits)
        FILE_CONTENT=$(head -5000 "$file")
        
        # Create context file for Claude
        CONTEXT_FILE="/tmp/claude_context_${PROVIDER}_${FILENAME}.txt"
        cat > "$CONTEXT_FILE" << EOF
File: $file
Provider: $PROVIDER
Document Type: $FILENAME

=== CURRENT FILE CONTENT (first 5000 lines) ===
$FILE_CONTENT

=== GIT DIFF ===
$DIFF_OUTPUT
EOF
        
        echo "$CONTEXT_FILE" >> /tmp/files_to_commit.txt
        echo "Created context file: $CONTEXT_FILE"
        
      else
        # Handle deleted files - commit immediately
        echo "Handling deleted file: $file"
        git add "$file" 2>/dev/null || git rm "$file" 2>/dev/null || true
        git commit -m "🗑️ Remove $PROVIDER $FILENAME agreement"
        echo "Committed deletion of: $file"
      fi
    fi
  done < <(echo "$ALL_CHANGED")
  
  echo "Context preparation complete"
  
else
  echo "No files changed in agreements directory"
  > /tmp/files_to_commit.txt
  # Set GitHub Actions output to indicate no files to process
  echo "has_agreement_changes=false" >> $GITHUB_OUTPUT
fi