#!/bin/bash
# Script to prepare context files for Claude analysis of agreement changes

set -e

# Configure git if not already set (for GitHub Actions)
git config --local user.email "action@github.com"
git config --local user.name "GitHub Action"

# Get list of all changed/new/deleted files in agreements directory
CHANGED_AGREEMENTS=$(git diff --name-only agreements/ 2>/dev/null || true)
STAGED_AGREEMENTS=$(git diff --staged --name-only agreements/ 2>/dev/null || true)

# Combine and deduplicate
ALL_CHANGED=$(echo -e "$CHANGED_AGREEMENTS\n$STAGED_AGREEMENTS" | sort | uniq | grep -v '^$' || true)

if [ -n "$ALL_CHANGED" ]; then
  echo "Found changed files in agreements directory:"
  echo "$ALL_CHANGED"
  
  # Create output file to track what we processed
  > /tmp/files_to_commit.txt
  
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
        DIFF_OUTPUT=$(git diff HEAD~1 "$file" 2>/dev/null || git diff --cached "$file" 2>/dev/null || echo "New file")
        
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
fi