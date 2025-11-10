# Legal Agreement Commit Message Generator

I need you to generate intelligent commit messages for legal agreement file changes.

## Context Available

For each context file in /tmp/, you'll find:
1. The current file content (legal agreement text)
2. The git diff showing what changed

## Analysis Requirements

Analyze both the content and changes to understand:
- What type of legal document this is (privacy policy, terms of service, etc.)
- What specific sections or policies were modified
- The nature of the changes (new policies, clarifications, restrictions, etc.)

## Message Format

Generate concise commit messages that describe what actually changed:
- Start with emoji (📄 for updates, ➕ for new files)
- Brief description under 50 characters focusing on the actual change
- Optional second line with specific details about what was modified

## Examples of Good Commit Messages

- "📄 Stripe adds cryptocurrency payment terms" (if crypto payments were added)
- "📄 Discord restricts AI bot usage\n\nNew section 4.3 prohibits automated content generation"
- "📄 Google extends data retention to 36 months\n\nUpdated privacy policy section on user data storage"

## Output Format

Output format should be one message per line:
FILENAME:MESSAGE

Where FILENAME matches the context file name (without path/extension) and MESSAGE is the commit message.

## Fallback

If you can't determine specific changes, use: FILENAME:📄 Update [provider] [document] agreement