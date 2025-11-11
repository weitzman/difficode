#!/bin/bash
# Script to process commits with Claude-generated messages

set -e

# Check if context files exist
if [ ! -f "/tmp/files_to_commit.txt" ] || [ ! -s "/tmp/files_to_commit.txt" ]; then
  echo "No agreement files to commit"
  exit 0
fi

# Get Claude's response from environment variable
CLAUDE_OUTPUT="$1"

if [ -z "$CLAUDE_OUTPUT" ]; then
  echo "Warning: No Claude output provided, will use fallback commit messages"
  CLAUDE_OUTPUT=""
fi

echo "Processing commits with Claude-generated messages..."

# Process each context file
while IFS= read -r context_file; do
  if [ -n "$context_file" ] && [[ "$context_file" == "/tmp/claude_context_"* ]]; then
    # Extract provider and filename from context file name
    BASENAME=$(basename "$context_file" .txt)
    PROVIDER=$(echo "$BASENAME" | cut -d'_' -f3)
    FILENAME=$(echo "$BASENAME" | cut -d'_' -f4-)
    
    echo "Processing context file: $context_file"
    echo "Provider: $PROVIDER, Filename: $FILENAME"
    
    # Look for Claude's message for this file
    COMMIT_MSG=""
    if [ -n "$CLAUDE_OUTPUT" ]; then
      COMMIT_MSG=$(echo "$CLAUDE_OUTPUT" | grep "^$BASENAME:" | cut -d':' -f2- | sed 's/^[[:space:]]*//' | head -1)
    fi
    
    # Use fallback if no Claude message
    if [ -z "$COMMIT_MSG" ]; then
      COMMIT_MSG="📄 Update $PROVIDER $FILENAME agreement"
      echo "Warning: No Claude message found for $BASENAME, using fallback"
    fi
    
    echo "Commit message: $COMMIT_MSG"
    
    # Find and stage the corresponding agreement file
    AGREEMENT_FILE="agreements/$PROVIDER/$FILENAME.md"
    if [ -f "$AGREEMENT_FILE" ]; then
      echo "Staging file: $AGREEMENT_FILE"
      git add "$AGREEMENT_FILE"
      
      # Check if there are actually changes to commit
      if git diff --staged --quiet; then
        echo "ℹ️  No changes to commit for $AGREEMENT_FILE"
      else
        if git commit -m "$COMMIT_MSG"; then
          echo "✅ Committed: $COMMIT_MSG"
        else
          echo "❌ Failed to commit for $BASENAME"
        fi
      fi
    else
      echo "⚠️  Agreement file not found: $AGREEMENT_FILE"
    fi
    
    # Clean up context file
    rm -f "$context_file"
  fi
done < /tmp/files_to_commit.txt

# Clean up temp files
rm -f /tmp/files_to_commit.txt

echo "Commit processing complete"