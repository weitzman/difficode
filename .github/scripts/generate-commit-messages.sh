#!/bin/bash
# Script to generate commit messages using Anthropic API directly

set -e

# Check if we have context files to process
if [ ! -f "/tmp/files_to_commit.txt" ] || [ ! -s "/tmp/files_to_commit.txt" ]; then
  echo "No context files found"
  exit 0
fi

# Check if Anthropic API key is available
if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
  echo "Warning: ANTHROPIC_API_KEY not set, skipping Claude generation"
  exit 0
fi

echo "Generating commit messages with Anthropic API..."

# Collect all context data
CONTEXT_DATA=""
while IFS= read -r context_file; do
  if [ -f "$context_file" ]; then
    echo "Reading context from: $context_file"
    CONTEXT_DATA="$CONTEXT_DATA\n\n=== CONTEXT FILE: $context_file ===\n"
    CONTEXT_DATA="$CONTEXT_DATA$(cat "$context_file")"
  fi
done < /tmp/files_to_commit.txt

# Create the prompt
PROMPT="I need you to generate commit messages for legal agreement files.

Context files provided:
$CONTEXT_DATA

For each context file, generate a commit message that:
- Starts with ➕ for new files or 📄 for updates
- Describes the content in under 50 characters
- Uses format: FILENAME:MESSAGE

For example:
claude_context_openai_terms:➕ Add OpenAI Terms of Service tracking
claude_context_openai_privacy:➕ Add OpenAI Privacy Policy tracking

Generate one message per context file:"

# Make API call to Anthropic
RESPONSE=$(curl -s -X POST https://api.anthropic.com/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -d "{
    \"model\": \"claude-3-sonnet-20240229\",
    \"max_tokens\": 1000,
    \"messages\": [{
      \"role\": \"user\",
      \"content\": $(echo "$PROMPT" | jq -R -s .)
    }]
  }")

# Extract the content from the response
if echo "$RESPONSE" | jq -e '.content[0].text' > /dev/null 2>&1; then
  CLAUDE_OUTPUT=$(echo "$RESPONSE" | jq -r '.content[0].text')
  echo "Claude generated commit messages:"
  echo "$CLAUDE_OUTPUT"
  
  # Set output for the next step
  echo "claude_output<<EOF" >> $GITHUB_OUTPUT
  echo "$CLAUDE_OUTPUT" >> $GITHUB_OUTPUT
  echo "EOF" >> $GITHUB_OUTPUT
else
  echo "Error in API response:"
  echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
  echo "claude_output=" >> $GITHUB_OUTPUT
fi