#!/bin/bash
# Hard-link all files from .claude/skills to .codex/skills

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SOURCE="$SCRIPT_DIR/.claude/skills"
DEST="$SCRIPT_DIR/.codex/skills"

if [ ! -d "$SOURCE" ]; then
  echo "Error: $SOURCE does not exist"
  exit 1
fi

find "$SOURCE" -type f | while read -r src_file; do
  rel="${src_file#$SOURCE/}"
  dest_file="$DEST/$rel"
  mkdir -p "$(dirname "$dest_file")"
  ln -f "$src_file" "$dest_file"
done

echo "Hard-linked $SOURCE → $DEST"
