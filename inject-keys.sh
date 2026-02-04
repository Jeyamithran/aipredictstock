#!/bin/sh
# This script injects API keys into env-config.js during Cloud Run startup

TARGET_FILE="/usr/share/nginx/html/env-config.js"

# Recreate config file
rm -rf $TARGET_FILE
touch $TARGET_FILE

# Add assignment 
echo "window.env = {" >> $TARGET_FILE

# Read environment variables and write them to the file
# We use printenv to check if they exist to avoid writing "undefined"
if [ -n "$VITE_FMP_API_KEY" ]; then
  echo "  VITE_FMP_API_KEY: \"$VITE_FMP_API_KEY\"," >> $TARGET_FILE
fi

if [ -n "$VITE_GEMINI_API_KEY" ]; then
  echo "  VITE_GEMINI_API_KEY: \"$VITE_GEMINI_API_KEY\"," >> $TARGET_FILE
fi

if [ -n "$VITE_OPENAI_API_KEY" ]; then
  echo "  VITE_OPENAI_API_KEY: \"$VITE_OPENAI_API_KEY\"," >> $TARGET_FILE
fi

if [ -n "$VITE_PERPLEXITY_API_KEY" ]; then
  echo "  VITE_PERPLEXITY_API_KEY: \"$VITE_PERPLEXITY_API_KEY\"," >> $TARGET_FILE
fi

if [ -n "$VITE_POLYGON_API_KEY" ]; then
  echo "  VITE_POLYGON_API_KEY: \"$VITE_POLYGON_API_KEY\"," >> $TARGET_FILE
fi

# Auth Variables
if [ -n "$VITE_HTTP_AUTH_ENABLED" ]; then
  echo "  VITE_HTTP_AUTH_ENABLED: \"$VITE_HTTP_AUTH_ENABLED\"," >> $TARGET_FILE
fi

if [ -n "$VITE_HTTP_AUTH_USER" ]; then
  echo "  VITE_HTTP_AUTH_USER: \"$VITE_HTTP_AUTH_USER\"," >> $TARGET_FILE
fi

if [ -n "$VITE_HTTP_AUTH_PASS" ]; then
  echo "  VITE_HTTP_AUTH_PASS: \"$VITE_HTTP_AUTH_PASS\"," >> $TARGET_FILE
fi

echo "  TEST_VAR: \"active\"" >> $TARGET_FILE

echo "};" >> $TARGET_FILE

echo "Generated env-config.js with keys injected"
cat $TARGET_FILE
