#!/bin/bash

echo "=== DATABASE QUERY USAGE COUNT ==="
echo ""
echo "DB DIRECTORY (db/*):"
for file in db/*.js; do
  count=$(grep -co "db\.\(prepare\|exec\)\|\.get(\|\.all(\|\.run(" "$file" 2>/dev/null || echo 0)
  printf "%-30s %3d calls\n" "$(basename $file)" "$count"
done

echo ""
echo "ROUTE FILES (routes/*):"
for file in routes/*.js; do
  count=$(grep -co "db\.\(prepare\|exec\)\|\.get(\|\.all(\|\.run(" "$file" 2>/dev/null || echo 0)
  printf "%-30s %3d calls\n" "$(basename $file)" "$count"
done

echo ""
echo "INTEGRATION FILES (routes/integrations/*):"
for file in routes/integrations/*.js; do
  count=$(grep -co "db\.\(prepare\|exec\)\|\.get(\|\.all(\|\.run(" "$file" 2>/dev/null || echo 0)
  printf "%-30s %3d calls\n" "$(basename $file)" "$count"
done

echo ""
echo "MIDDLEWARE & MAIN:"
for file in middleware/*.js index.js; do
  count=$(grep -co "db\.\(prepare\|exec\)\|\.get(\|\.all(\|\.run(" "$file" 2>/dev/null || echo 0)
  if [ "$count" != "0" ]; then
    printf "%-30s %3d calls\n" "$(basename $file)" "$count"
  fi
done
