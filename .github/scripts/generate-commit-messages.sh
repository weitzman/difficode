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

# Debug: Show the prompt being sent
echo "=== PROMPT BEING SENT ==="
echo "$PROMPT"
echo "=========================="

# Make API call to Anthropic
echo "Making API call to Anthropic..."
RESPONSE=$(curl -w "HTTP_CODE:%{http_code}\n" -s -X POST https://api.anthropic.com/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -d "{
    \"model\": \"claude-sonnet-4-5\",
    \"max_tokens\": 1000,
    \"messages\": [{
      \"role\": \"user\",
      \"content\": $(echo "$PROMPT" | jq -R -s .)
    }]
  }")

# Extract HTTP code
HTTP_CODE=$(echo "$RESPONSE" | tail -n 1 | grep -o 'HTTP_CODE:[0-9]*' | cut -d: -f2)
API_RESPONSE=$(echo "$RESPONSE" | sed '$d')

echo "HTTP Status Code: $HTTP_CODE"
echo "API Response: $API_RESPONSE"

# Extract the content from the response
if [ "$HTTP_CODE" = "200" ] && echo "$API_RESPONSE" | jq -e '.content[0].text' > /dev/null 2>&1; then
  CLAUDE_OUTPUT=$(echo "$API_RESPONSE" | jq -r '.content[0].text')
  echo "Claude generated commit messages:"
  echo "$CLAUDE_OUTPUT"
  
  # Set output for the next step
  echo "claude_output<<EOF" >> $GITHUB_OUTPUT
  echo "$CLAUDE_OUTPUT" >> $GITHUB_OUTPUT
  echo "EOF" >> $GITHUB_OUTPUT
else
  echo "Error in API call (HTTP $HTTP_CODE):"
  echo "$API_RESPONSE" | jq '.' 2>/dev/null || echo "$API_RESPONSE"
  
  # Check for common error patterns
  if echo "$API_RESPONSE" | grep -q "authentication"; then
    echo "Authentication error - check ANTHROPIC_API_KEY"
  elif echo "$API_RESPONSE" | grep -q "rate_limit"; then
    echo "Rate limit error - API usage may be exceeded"
  elif echo "$API_RESPONSE" | grep -q "invalid_request"; then
    echo "Invalid request error - check prompt formatting"
  fi
  
  echo "claude_output=" >> $GITHUB_OUTPUT
fi