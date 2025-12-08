#!/bin/bash
set -e

# Ensure we are in the project root
cd "$(dirname "$0")/.."

# Check for git
if ! command -v git &> /dev/null; then
    echo "Error: git is not installed."
    exit 1
fi

# Read current version
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo "Current version: $CURRENT_VERSION"

# Prompt for new version
read -p "Enter new version (e.g., 0.0.1): " NEW_VERSION

if [ -z "$NEW_VERSION" ]; then
    echo "Error: Version cannot be empty"
    exit 1
fi

echo "Preparing release v$NEW_VERSION..."

# Update version in package.json and package-lock.json without creating a git tag yet
npm version "$NEW_VERSION" --no-git-tag-version --allow-same-version

# Compile and package (Local build for verification)
echo "Building extension package locally..."
npm run package

VSIX_FILE="generic-copilot.vsix"

if [ ! -f "$VSIX_FILE" ]; then
    echo "Error: $VSIX_FILE not found after build."
    exit 1
fi

echo "Local VSIX built successfully: $VSIX_FILE"

# --------------------------------------------------
# Update CHANGELOG.md
# --------------------------------------------------
CHANGELOG_FILE="CHANGELOG.md"

# Create CHANGELOG.md if it doesn't exist
if [ ! -f "$CHANGELOG_FILE" ]; then
    echo "# Changelog" > "$CHANGELOG_FILE"
    echo "" >> "$CHANGELOG_FILE"
fi

echo "Updating $CHANGELOG_FILE..."

# Get the latest tag (or empty if none)
LATEST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")

# Prepare the new section header
NEW_SECTION="## [v$NEW_VERSION] - $(date +%Y-%m-%d)"

# Generate commit list
if [ -z "$LATEST_TAG" ]; then
    # No previous tag, list all commits
    COMMITS=$(git log --pretty=format:"- %s (%h)")
else
    # List commits since the last tag
    COMMITS=$(git log --pretty=format:"- %s (%h)" "$LATEST_TAG"..HEAD)
fi

# Create a temporary file for the new content
TEMP_CHANGELOG="TEMP_CHANGELOG.md"

# Write the new section to the temp file
echo "$NEW_SECTION" > "$TEMP_CHANGELOG"
echo "" >> "$TEMP_CHANGELOG"
if [ -z "$COMMITS" ]; then
    echo "- No changes detected (manual release)." >> "$TEMP_CHANGELOG"
else
    echo "$COMMITS" >> "$TEMP_CHANGELOG"
fi
echo "" >> "$TEMP_CHANGELOG"

# Append the existing changelog content (skipping the first line if it's just "# Changelog")
# But to keep it simple, we'll just append the old file content below our new section.
# If the file starts with "# Changelog", we might want to keep that at the very top.

# Simple strategy:
# 1. Read existing file.
# 2. If it has "# Changelog" at the top, keep it there.
# 3. Insert our new section after the title.

if grep -q "^# Changelog" "$CHANGELOG_FILE"; then
    # File has the header. Let's construct the new file:
    # Header -> New Section -> Rest of file (skipping the header line)
    echo "# Changelog" > "$TEMP_CHANGELOG.final"
    echo "" >> "$TEMP_CHANGELOG.final"
    cat "$TEMP_CHANGELOG" >> "$TEMP_CHANGELOG.final"
    tail -n +2 "$CHANGELOG_FILE" >> "$TEMP_CHANGELOG.final" # tail +2 skips first line (assuming line 1 is header)
    mv "$TEMP_CHANGELOG.final" "$CHANGELOG_FILE"
else
    # File doesn't have standard header, just prepend.
    cat "$CHANGELOG_FILE" >> "$TEMP_CHANGELOG"
    mv "$TEMP_CHANGELOG" "$CHANGELOG_FILE"
fi

rm -f "$TEMP_CHANGELOG"
echo "Changelog updated."

# Git operations
echo "--------------------------------------------------"
echo "Committing changes and creating git tag v$NEW_VERSION..."
git add package.json package-lock.json "$CHANGELOG_FILE"
git commit -m "chore: release version $NEW_VERSION"
git tag -a "v$NEW_VERSION" -m "Release v$NEW_VERSION"

echo "Pushing changes and tags to GitHub..."
git push origin HEAD --follow-tags

echo "--------------------------------------------------"
echo "Release v$NEW_VERSION tag pushed!"
echo "GitHub Actions will now:"
echo "1. Build the release again in CI"
echo "2. Publish to VS Code Marketplace"
echo "3. Create a GitHub Release"
